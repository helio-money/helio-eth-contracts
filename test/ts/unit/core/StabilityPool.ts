import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { InternalStabilityPool, MockDebtToken, MockListaCore } from "../../../../typechain-types";
import { _1E18, abi, DAY, encodeCallData, ETHER, HOUR, WEEK, ZERO, ZERO_ADDRESS } from "../../utils";

const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("StabilityPool", () => {
  const fakeFactory = "0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd";
  const fakeLiquidationManager = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const emissionId = 0;
  const initialP = _1E18;
  const initialG = ZERO;
  const scaleFactor = BigNumber.from("10").pow(9);

  const REWARD_DURATION = WEEK;
  const SUNSET_DURATION = 180 * DAY;
  const DECIMAL_PRECISION = ETHER;

  let listaCore: MockListaCore;
  let stabilityPool: InternalStabilityPool;
  let listaVault: MockDebtToken;
  let debtToken: MockDebtToken;
  let erc20Token: MockDebtToken;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    listaVault = await ethers.deployContract("MockDebtToken", ["vault", "VAULT"]) as MockDebtToken;
    await listaVault.deployed();

    debtToken = await ethers.deployContract("MockDebtToken", ["debt", "DEBT"]) as MockDebtToken;
    await debtToken.deployed();

    erc20Token = await ethers.deployContract("MockDebtToken", ["coll", "COLL"]) as MockDebtToken;
    await erc20Token.deployed();

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    await listaCore.setOwner(await owner.getAddress());
    const startTime = await time.latest();
    await listaCore.setStartTime(startTime);

    await time.setNextBlockTimestamp(startTime + 2 * DAY);
    stabilityPool = await ethers.deployContract("InternalStabilityPool", [
      listaCore.address,
      debtToken.address,
      listaVault.address,
      fakeFactory,
      fakeLiquidationManager
    ]) as InternalStabilityPool;
    await stabilityPool.deployed();
  });

  const prepareCollateral = async (token: Contract) => {
    await stabilityPool.setFactory(await owner.getAddress());
    await stabilityPool.enableCollateral(token.address);
  }

  const getStoredPendingReward = async (depositor: string) => {
    let data = await ethers.provider.getStorageAt(
      stabilityPool.address,
      ethers.utils.solidityKeccak256(["uint256", "uint256"], [depositor, 12])
    );
    return abi.decode(["uint256"], data)[0];
  }

  describe("Deployment", () => {
    it("Should OK after deploy", async () => {
      expect(await stabilityPool.LISTA_CORE()).to.be.equal(listaCore.address);
      expect(await stabilityPool.periodFinish()).to.be.equal(await time.latest() - 1);
      expect(await listaCore.startTime()).to.be.equal(await time.latest() - 2 * DAY);

      await time.increase(17 * DAY);
      const startTime = await listaCore.startTime();
      const now = await time.latest();
      const expected = Math.floor((now - startTime.toNumber()) / WEEK);
      const week = await stabilityPool.getWeek();
      expect(week).to.be.equal(expected);

      expect(await stabilityPool.debtToken()).to.be.equal(debtToken.address);
      expect(await stabilityPool.vault()).to.be.equal(listaVault.address);
      expect(await stabilityPool.factory()).to.be.equal(fakeFactory);
      expect(await stabilityPool.liquidationManager()).to.be.equal(fakeLiquidationManager);
    });

    it("Should revert if not owner", async () => {
      const fakeAddress = "0x49518B55ED4404e7C553dB21CB1116F40720b6ae";
      const errorMessage = "Only owner";
      const sp = stabilityPool.connect(user1);

      await expect(sp.setDebtToken(fakeAddress)).to.be.revertedWith(errorMessage);
      await expect(sp.setVault(fakeAddress)).to.be.revertedWith(errorMessage);
      await expect(sp.setFactory(fakeAddress)).to.be.revertedWith(errorMessage);
      await expect(sp.setLiquidationManager(fakeAddress)).to.be.revertedWith(errorMessage);
      await expect(sp.startCollateralSunset(fakeAddress)).to.be.revertedWith(errorMessage);
    });
  });

  describe("internal Functions", () => {
    it("_vestedEmissions", async () => {
      const rewardRate = 200;
      await stabilityPool.setRewardRate(rewardRate);
      let periodFinish = await stabilityPool.periodFinish() + WEEK;

      // 1. lastUpdateCached >= updated
      await stabilityPool.setPeriodFinish(periodFinish);
      await stabilityPool.setLastUpdate(100 + await time.latest());
      expect(await stabilityPool.periodFinish()).to.be.gt(await time.latest());
      expect(await stabilityPool.lastUpdate()).to.be.gte(await time.latest());
      expect(await stabilityPool.vestedEmissions()).to.be.equal(0);

      // 2. has duration
      await stabilityPool.setPeriodFinish(await time.latest() - 5);
      await stabilityPool.setLastUpdate(await time.latest() - 1000);
      // updated <= block.timestamp;
      expect(await stabilityPool.periodFinish()).to.be.lt(await time.latest());
      expect(await stabilityPool.periodFinish()).to.be.lte(await time.latest());
      const updated = Math.min(await stabilityPool.periodFinish(), await time.latest());
      let duration = updated - (await stabilityPool.lastUpdate());
      // duration > 0
      expect(duration).to.be.gt(0);
      expect(await stabilityPool.vestedEmissions()).to.be.equal(duration * rewardRate);
    });

    it("_computeListaPerUnitStaked", async () => {
      const lastListaError = BigNumber.from("50000");
      await stabilityPool.setLastListaError(lastListaError);

      const issuance = BigNumber.from("4000");
      const totalDebtDeposits = BigNumber.from("1234567");

      const listaNumberator = issuance.mul(DECIMAL_PRECISION).add(lastListaError);
      const perUnitStaked = listaNumberator.div(totalDebtDeposits);
      const newListaError = listaNumberator.mod(totalDebtDeposits);

      const data = await ethers.provider.call({
        to: stabilityPool.address,
        data: encodeCallData(
          "computeListaPerUnitStaked(uint256,uint256)",
          "uint256,uint256".split(","),
          [issuance, totalDebtDeposits]
        )
      });
      await stabilityPool.computeListaPerUnitStaked(issuance, totalDebtDeposits);

      const returnedPerUnitStaked = abi.decode(["uint256"], data)[0];
      expect(returnedPerUnitStaked).to.be.equal(perUnitStaked);
      expect(await stabilityPool.lastListaError()).to.be.equal(newListaError);
    });

    it("_triggerRewardIssuance", async () => {
      const startTime = await listaCore.startTime();
      let periodFinish = BigNumber.from(await stabilityPool.periodFinish());
      let fakeEmissionAmount = BigNumber.from("3000000");

      await listaVault.setEmissionAmount(fakeEmissionAmount);

      let lastUpdateWeek = periodFinish.sub(startTime).div(WEEK);
      let week = await stabilityPool.getWeek();
      expect(week).to.be.equal(0);
      expect(lastUpdateWeek).to.be.equal(0);

      // 1st deposit
      expect(await time.latest()).to.be.gte(periodFinish);
      const rewardRate = fakeEmissionAmount.div(REWARD_DURATION);

      await stabilityPool.triggerRewardIssuance();
      const newPeriodFinish = await time.latest() + REWARD_DURATION;
      expect(await stabilityPool.rewardRate()).to.be.equal(rewardRate);
      expect(await stabilityPool.periodFinish()).to.be.equal(newPeriodFinish);
      expect(await stabilityPool.lastUpdate()).to.be.equal(await time.latest());

      let lastRewardRate = await stabilityPool.rewardRate();
      let lastPeriodFinish = BigNumber.from(await stabilityPool.periodFinish());
      let lastLastUpdate = BigNumber.from(await stabilityPool.lastUpdate());

      // 2nd and in the same week
      await time.increaseTo(await time.latest() + DAY);

      await stabilityPool.triggerRewardIssuance();
      const innterLastUpdateWeekValue = lastPeriodFinish.sub(startTime).div(WEEK)
      expect(innterLastUpdateWeekValue).to.be.equal(1);
      expect(await stabilityPool.getWeek()).to.be.equal(0);

      lastRewardRate = await stabilityPool.rewardRate();
      lastPeriodFinish = BigNumber.from(await stabilityPool.periodFinish());
      lastLastUpdate = BigNumber.from(await stabilityPool.lastUpdate());

      // 3rd and in the next week
      await time.increaseTo(lastPeriodFinish.add(2 * DAY).toNumber());
      fakeEmissionAmount = BigNumber.from("4000000");
      await listaVault.setEmissionAmount(fakeEmissionAmount);

      await stabilityPool.triggerRewardIssuance();
      // block.timestamp >= lastPeriodFinish
      expect(await time.latest()).to.be.gte(lastPeriodFinish);
      expect(await stabilityPool.getWeek()).to.be.equal(1);
      expect(await stabilityPool.rewardRate()).to.be.equal(fakeEmissionAmount.div(REWARD_DURATION));
      expect(await stabilityPool.periodFinish()).to.be.equal(await time.latest() + REWARD_DURATION);
      expect(await stabilityPool.lastUpdate()).to.be.equal(await time.latest());

      lastLastUpdate = BigNumber.from(await stabilityPool.lastUpdate());

      // 4th and in the same week
      await time.increaseTo(await time.latest() + HOUR);
      await stabilityPool.triggerRewardIssuance();
      expect(await stabilityPool.getWeek()).to.be.equal(1);
      expect(await stabilityPool.getWeek()).to.be.lt(lastLastUpdate);
      await time.increaseTo(await time.latest() + DAY - 1);
    });

    it("_accrueDepositorCollateralGain", async () => {
      const depositor = await user1.getAddress();

      // 1. initialDeposit == 0
      let data = await ethers.provider.call({
        to: stabilityPool.address,
        data: encodeCallData("privateAccrueDepositorCollateralGain(address)", ["address"], [depositor])
      });
      expect(abi.decode(["bool"], data)[0]).to.be.false;

      // 2. initialDeposit != 0
      // prepare
      const initialGains = BigNumber.from("1000000000");
      await stabilityPool.setCollateralGains(depositor, 0, initialGains);
      await prepareCollateral(erc20Token);
      const fakeAccountDeposit = { amount: ethers.utils.parseEther("0.78"), timestamp: await time.latest() };
      await stabilityPool.setAccountDeposits(depositor, fakeAccountDeposit);
      const snapshots = { P: initialP, G: 0, scale: 0, epoch: 0 };
      await stabilityPool.setDepositSnapshots(depositor, snapshots);
      const S = ethers.utils.parseEther("123")
      const nextS = ethers.utils.parseEther("78")
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S);
      await stabilityPool.setEpochToScaleToSums(0, 0, 1, nextS);
      const depSum = BigNumber.from("300000000");
      await stabilityPool.setDepositSums(depositor, 0, depSum);

      // check
      data = await ethers.provider.call({
        to: stabilityPool.address,
        data: encodeCallData("privateAccrueDepositorCollateralGain(address)", ["address"], [depositor])
      });
      expect(abi.decode(["bool"], data)[0]).to.be.true;

      await stabilityPool.privateAccrueDepositorCollateralGain(depositor);
      const firstPortion = S.sub(depSum);
      const secondPortion = nextS.div(scaleFactor);
      expect(await stabilityPool.collateralGainsByDepositor(depositor, 0))
        .to.be.equal(
          fakeAccountDeposit.amount
            .mul(
              firstPortion.add(secondPortion)
            )
            .div(snapshots.P)
            .div(DECIMAL_PRECISION)
            .add(initialGains)
        );
    });

    it("enableCollateral", async () => {
      await stabilityPool.setFactory(await owner.getAddress());

      await expect(stabilityPool.connect(user1).enableCollateral(erc20Token.address)).to.be.revertedWith("Not factory")
      await stabilityPool.enableCollateral(erc20Token.address);
      await expect(stabilityPool.enableCollateral(erc20Token.address)).to.be.not.reverted;

      expect(await stabilityPool.getCollateralLength()).to.be.equal(1);
      expect(await stabilityPool.indexByCollateral(erc20Token.address)).to.be.equal(1);

      await stabilityPool.startCollateralSunset(erc20Token.address);
      await expect(stabilityPool.enableCollateral(erc20Token.address)).to.be.revertedWith("Collateral is sunsetting");
    });

    it("enableCollateral of sunsetted collaterals", async () => {
      await prepareCollateral(debtToken);
      await prepareCollateral(erc20Token);

      await stabilityPool.startCollateralSunset(debtToken.address);
      await stabilityPool.startCollateralSunset(erc20Token.address);

      expect(await stabilityPool.indexByCollateral(debtToken.address)).to.be.equal(ZERO_ADDRESS);
      expect(await stabilityPool.indexByCollateral(erc20Token.address)).to.be.equal(ZERO_ADDRESS);

      let newCollToken = await ethers.deployContract("MockDebtToken", ["new", "NEW"]) as MockDebtToken;
      await newCollToken.deployed();

      // not expired
      const beforeCollLength = await stabilityPool.getCollateralLength();
      await stabilityPool.enableCollateral(newCollToken.address);
      const afterCollLength = await stabilityPool.getCollateralLength();
      expect(afterCollLength.sub(beforeCollLength)).to.be.equal(1);
      expect(await stabilityPool.indexByCollateral(newCollToken.address)).to.be.equal(3);

      // expired sunsetting
      let newCollToken2 = await ethers.deployContract("MockDebtToken", ["new2", "NEW2"]) as MockDebtToken;
      await newCollToken2.deployed();

      await time.increase(SUNSET_DURATION);
      const tx2 = await stabilityPool.enableCollateral(newCollToken2.address);

      await expect(tx2).to.emit(stabilityPool, "CollateralOverwritten")
        .withArgs(debtToken.address, newCollToken2.address);
      expect(await stabilityPool.getCollateralLength()).to.be.equal(3);
      expect(await stabilityPool.indexByCollateral(newCollToken2.address)).to.be.equal(0 + 1);
    });

    it("startCollateralSunset", async () => {
      await expect(stabilityPool.startCollateralSunset(erc20Token.address)).to.be.revertedWith("Collateral already sunsetting");

      await prepareCollateral(debtToken);
      await prepareCollateral(erc20Token);
      expect(await stabilityPool.indexByCollateral(erc20Token.address)).to.be.equal(1 + 1);

      const beforeQueue = await stabilityPool.getQueue();
      await stabilityPool.startCollateralSunset(erc20Token.address);

      const sunsetIndex = await stabilityPool.getSunsetIndex(beforeQueue.nextSunsetIndexKey);
      expect(sunsetIndex.idx).to.be.equal(1);
      expect(sunsetIndex.expiry).to.be.equal(await time.latest() + SUNSET_DURATION);
      expect((await stabilityPool.getQueue()).nextSunsetIndexKey).to.be.equal(beforeQueue.nextSunsetIndexKey + 1);
      // delete test
      expect(await stabilityPool.indexByCollateral(erc20Token.address)).to.be.equal(0);
    });

    it("_overwriteCollateral", async () => {
      await expect(stabilityPool.overwriteCollateral(debtToken.address, 0)).to.be.revertedWith("Index too large");

      // prepare
      const currentEpoch = 1;
      const currentScale = 1;
      const idx = 1;
      for (let i = 0; i <= currentEpoch; i++) {
        for (let j = 0; j <= currentScale; j++) {
          await stabilityPool.setEpochToScaleToSums(i, j, idx, ethers.utils.parseEther((i + 1).toString()));
        }
      }
      const testToken = await ethers.deployContract("MockDebtToken", ["test", "TEST"]) as MockDebtToken;
      await testToken.deployed();
      await prepareCollateral(testToken);
      await prepareCollateral(debtToken);
      await stabilityPool.setCurrentEpoch(currentEpoch);
      await stabilityPool.setCurrentScale(currentScale);

      await expect(stabilityPool.overwriteCollateral(debtToken.address, 0)).to.be.revertedWith("Collateral must be sunset");

      await stabilityPool.startCollateralSunset(debtToken.address);

      expect(await stabilityPool.epochToScaleToSums(0, 0, idx)).to.be.not.equal(0);
      expect(await stabilityPool.epochToScaleToSums(0, 1, idx)).to.be.not.equal(0);
      expect(await stabilityPool.epochToScaleToSums(1, 0, idx)).to.be.not.equal(0);
      expect(await stabilityPool.epochToScaleToSums(1, 1, idx)).to.be.not.equal(0);
      expect(await stabilityPool.currentEpoch()).to.be.equal(currentEpoch);
      expect(await stabilityPool.currentScale()).to.be.equal(currentScale);

      // check
      const tx = await stabilityPool.overwriteCollateral(erc20Token.address, idx);
      await expect(tx).to.emit(stabilityPool, "CollateralOverwritten")
        .withArgs(debtToken.address, erc20Token.address)

      expect(await stabilityPool.indexByCollateral(erc20Token.address)).to.be.equal(idx + 1);
      expect(await stabilityPool.collateralTokens(idx)).to.be.equal(erc20Token.address);

      expect(await stabilityPool.epochToScaleToSums(0, 0, idx)).to.be.equal(0);
      expect(await stabilityPool.epochToScaleToSums(0, 1, idx)).to.be.equal(0);
      expect(await stabilityPool.epochToScaleToSums(1, 0, idx)).to.be.equal(0);
      expect(await stabilityPool.epochToScaleToSums(1, 1, idx)).to.be.equal(0);

    });

    it("_updateSnapshots with newValue = 0", async () => {
      await prepareCollateral(erc20Token);
      const depositor = await user1.getAddress();

      const beforeSnapshots = await stabilityPool.depositSnapshots(depositor);
      expect(beforeSnapshots.P).to.be.equal(0);
      expect(beforeSnapshots.G).to.be.equal(0);
      expect(beforeSnapshots.scale).to.be.equal(0);
      expect(beforeSnapshots.epoch).to.be.equal(0);

      const tx = await stabilityPool.updateSnapshots(await user1.getAddress(), 0);
      await expect(tx)
        .to.emit(stabilityPool, "DepositSnapshotUpdated")
        .withArgs(depositor, 0, 0);
    });

    it("_updateSnapshots", async () => {
      await prepareCollateral(erc20Token);
      const depositor = await user1.getAddress();
      const newDeposit = ethers.utils.parseEther("1.342");

      const currentP = await stabilityPool.P();
      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();
      const currentG = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      expect(currentP).to.be.equal(initialP);
      expect(currentG).to.be.equal(0);
      expect(currentEpoch).to.be.equal(0);
      expect(currentScale).to.be.equal(0);

      const tx = await stabilityPool.updateSnapshots(depositor, newDeposit);
      await expect(tx)
        .to.emit(stabilityPool, "DepositSnapshotUpdated")
        .withArgs(depositor, initialP, 0);

      const depositSnapshot = await stabilityPool.depositSnapshots(depositor);
      expect(depositSnapshot.P).to.be.equal(currentP);
      expect(depositSnapshot.G).to.be.equal(currentG);
      expect(depositSnapshot.epoch).to.be.equal(currentEpoch);
      expect(depositSnapshot.scale).to.be.equal(currentScale);

      expect(await stabilityPool.getCollateralLength()).to.be.equal(1);
      const index = 0;
      const userS = await stabilityPool.epochToScaleToSums(currentEpoch, currentScale, index);
      expect(await stabilityPool.depositSums(depositor, index)).to.be.equal(userS);
    });

    it("_getCompoundedStakeFromSnapshots", async () => {
      const depositor = await user1.getAddress();
      const snapshots1 = { P: initialP, G: 0, scale: 0, epoch: 0 };
      await stabilityPool.putDepositSnapshots(depositor, snapshots1);
      const initialStake = ethers.utils.parseEther("12.34");
      const currentP = initialP;

      const currentScale = await stabilityPool.currentScale();
      expect(currentScale).to.be.equal(0);
      const scaleDiff = currentScale.sub(snapshots1.scale);
      expect(scaleDiff).to.be.equal(0);

      // 1. scaleDiff == 0
      expect(await stabilityPool.getCompoundedStakeFromSnapshots(initialStake, snapshots1))
        .to.be.equal(initialStake.mul(currentP).div(snapshots1.P));

      // non-zero parameters
      // 2. if epochSnapshot < currentEpoch
      const snapshots2 = { P: initialP, G: 0, scale: 1, epoch: 2 };
      await stabilityPool.setEpoch(snapshots2.epoch + 1);
      expect(await stabilityPool.getCompoundedStakeFromSnapshots(initialStake, snapshots2))
        .to.be.equal(0);

      // 3. scale diff == 1 and > stake / 1e9
      // prepare
      const snapshots3 = { P: initialP, G: 0, scale: 1, epoch: 2 };
      const fakeCurrentP = snapshots3.P;
      let fakeCurrrentScale = snapshots3.scale + 1;
      await stabilityPool.setP(fakeCurrentP);
      await stabilityPool.setScale(fakeCurrrentScale);
      await stabilityPool.setEpoch(snapshots3.epoch);
      await stabilityPool.putDepositSnapshots(depositor, snapshots3);

      expect(await stabilityPool.currentScale()).to.be.equal(snapshots3.scale + 1);
      expect(await stabilityPool.P()).to.be.equal(fakeCurrentP);
      expect(await stabilityPool.getCompoundedStakeFromSnapshots(
        initialStake, snapshots2
      ))
        .to.be.equal(initialStake.mul(fakeCurrentP).div(snapshots3.P).div(scaleFactor));

      // 4. scale diff == 2
      // prepare
      const snapshots4 = { P: initialP, G: 0, scale: 1, epoch: 2 };
      await stabilityPool.setP(snapshots4.P);
      await stabilityPool.setScale(snapshots4.scale + 2);
      await stabilityPool.setEpoch(snapshots4.epoch);

      expect(await stabilityPool.getCompoundedStakeFromSnapshots(
        initialStake, snapshots4
      ))
        .to.be.equal(0)
    });

    it("getCompoundedDebtDeposit", async () => {
      const depositor = await user1.getAddress();

      // 1. initialDeposit == 0
      expect((await stabilityPool.accountDeposits(depositor)).amount).to.be.equal(0);
      expect(await stabilityPool.getCompoundedDebtDeposit(depositor)).to.be.equal(0);

      // 2. else
      const fakeAccountDeposit = { amount: ethers.utils.parseEther("1.23"), timestamp: await time.latest() };
      await stabilityPool.setAccountDeposits(depositor, fakeAccountDeposit);
      const fakeSnapshots = { P: initialP, G: 0, scale: 0, epoch: 0 };
      await stabilityPool.setDepositSnapshots(depositor, fakeSnapshots);

      const currentP = await stabilityPool.P();
      expect(currentP).to.be.equal(initialP);
      expect(await stabilityPool.getCompoundedDebtDeposit(depositor))
        .to.be.equal(fakeAccountDeposit.amount.mul(currentP).div(fakeSnapshots.P));
    });

    it("_getListaGainFromSnapshots, ", async () => {
      const initialStake = ethers.utils.parseEther("123.789");
      const snapshots = { P: initialP, G: initialG, scale: 0, epoch: 0 };
      const firstG = snapshots.G.mul(5).div(2);
      const secondG = snapshots.G.mul(8).div(10);
      await stabilityPool.setEpochToScaleToG(snapshots.epoch, snapshots.scale, firstG);
      await stabilityPool.setEpochToScaleToG(snapshots.epoch, snapshots.scale + 1, secondG);

      const firstPortion = firstG.sub(snapshots.G);
      const secondPortion = secondG.div(scaleFactor);
      const expectedGain = initialStake.mul(firstPortion.add(secondPortion)).div(snapshots.P).div(DECIMAL_PRECISION);
      const gain = await stabilityPool.getListaGainFromSnapshots(initialStake, snapshots);
      expect(gain).to.be.equal(expectedGain);
    });

    it("_claimableReward", async () => {
      const depositor = await user1.getAddress();
      await prepareCollateral(erc20Token);

      // 1. initialDeposit == 0
      expect(await stabilityPool.privateClaimableReward(depositor)).to.be.equal(0);
      expect(await getStoredPendingReward(depositor)).to.be.equal(0);

      // 2. initialDeposit != 0
      const fakeAccountDeposit = { amount: ethers.utils.parseEther("1.23"), timestamp: await time.latest() };
      await stabilityPool.setAccountDeposits(depositor, fakeAccountDeposit);

      // 2.1. prepare data
      const snapshots = { P: initialP, G: initialG, scale: 0, epoch: 0 };
      await stabilityPool.setDepositSnapshots(depositor, snapshots);
      const firstG = snapshots.G.mul(5).div(2);
      const secondG = snapshots.G.mul(8).div(10);
      await stabilityPool.setEpochToScaleToG(snapshots.epoch, snapshots.scale, firstG);
      await stabilityPool.setEpochToScaleToG(snapshots.epoch, snapshots.scale + 1, secondG);

      // 2.2. check
      const firstPortion = firstG.sub(snapshots.G);
      const secondPortion = secondG.div(scaleFactor);
      const expectedGain = fakeAccountDeposit.amount.mul(firstPortion.add(secondPortion)).div(snapshots.P).div(DECIMAL_PRECISION);
      expect(await stabilityPool.privateClaimableReward(depositor))
        .to.be.equal(expectedGain);

      expect(await getStoredPendingReward(depositor)).to.be.equal(0);
      await stabilityPool.accrueRewards(depositor);
      expect(await getStoredPendingReward(depositor)).to.be.equal(expectedGain);
    });

    it("claimableReward with zero initial values", async () => {
      // 1. initialDeposit == 0 and totalDebt != 0
      await stabilityPool.setTotalDebtTokenDeposit(100);
      expect(await stabilityPool.claimableReward(await owner.getAddress())).to.be.equal(0);

      // 2. initialDeposit != 0 && totalDebt == 0
      await stabilityPool.provideToSP(1000);
      await stabilityPool.setTotalDebtTokenDeposit(0);
      expect(await stabilityPool.claimableReward(await owner.getAddress())).to.be.equal(0);
    });

    it("claimableReward", async () => {
      // prepare
      const emissionAmount = ethers.utils.parseEther("300");
      await listaVault.setEmissionAmount(emissionAmount);
      const amount = ethers.utils.parseEther("12.345");
      const amount2 = ethers.utils.parseEther("5.678");
      const totalDebt = amount.add(amount2);
      const depositor = await owner.getAddress();
      await stabilityPool.provideToSP(amount);
      await debtToken.transfer(await user1.getAddress(), amount2);
      await stabilityPool.connect(user1).provideToSP(amount2);
      const lastUpdate = await time.latest();
      expect(await stabilityPool.getTotalDebtTokenDeposits()).to.be.equal(amount.add(amount2));
      const listaError = BigNumber.from("7654321");
      await stabilityPool.setLastListaError(listaError);
      const currentP = initialP.sub("123");
      await stabilityPool.setP(currentP);
      const currentG = initialG.add(ethers.utils.parseEther("1.2"));
      await stabilityPool.setEpochToScaleToG(0, 0, currentG);
      const snapshots = await stabilityPool.depositSnapshots(depositor);

      await time.increase(2 * DAY);

      // check
      const rewardRate = emissionAmount.div(REWARD_DURATION);
      const duration = await time.latest() - lastUpdate;
      const vestedAmount = rewardRate.mul(duration);
      const listaNumberator = vestedAmount.mul(DECIMAL_PRECISION).add(listaError);
      const listaPerUnitStaked = listaNumberator.div(totalDebt);
      const marginalListaGain = listaPerUnitStaked.mul(currentP);
      expect(await stabilityPool.currentScale()).to.be.equal(snapshots.scale);
      const firstPortion = currentG.sub(snapshots.G).add(marginalListaGain);
      const secondPortion = 0;
      const claimableRewardValue = await stabilityPool.claimableReward(depositor);
      expect(claimableRewardValue)
        .to.be.equal(amount.mul(firstPortion.add(secondPortion)).div(snapshots.P).div(DECIMAL_PRECISION));
      await stabilityPool.updateG(vestedAmount);
      expect(claimableRewardValue).to.be.equal(await stabilityPool.privateClaimableReward(depositor));
    });

    it("provideToSP", async () => {
      const amount = ethers.utils.parseEther("12.345");
      const depositor = await owner.getAddress();
      const fakeEmissionAmount = ethers.utils.parseEther("23300");
      await listaVault.setEmissionAmount(fakeEmissionAmount);
      await prepareCollateral(erc20Token);

      await time.increase(DAY);

      await expect(stabilityPool.provideToSP(0)).to.be.revertedWith("StabilityPool: Amount must be non-zero");
      const tx = await stabilityPool.provideToSP(amount);
      await expect(tx).to.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated").withArgs(amount);
      await expect(tx).to.emit(stabilityPool, "UserDepositChanged").withArgs(depositor, amount);
      await expect(tx).to.not.emit(stabilityPool, "G_Updated");
      await expect(tx).to.emit(stabilityPool, "DepositSnapshotUpdated").withArgs(depositor, initialP, 0)

      // triggerRewardIssuance
      let now = await time.latest();
      expect(await stabilityPool.vestedEmissions()).to.be.equal(0);
      expect(await stabilityPool.rewardRate()).to.be.equal(fakeEmissionAmount.div(REWARD_DURATION));
      expect(await stabilityPool.periodFinish()).to.be.equal(now + REWARD_DURATION);
      expect(await stabilityPool.lastUpdate()).to.be.equal(now);
      expect(await stabilityPool.getWeek()).to.be.equal(0);
      // hasGain == false
      expect((await stabilityPool.accountDeposits(depositor)).amount).to.be.equal(amount);
      // sendToSP
      expect(await debtToken.balanceOf(stabilityPool.address)).to.be.equal(amount);

      const accoutDeposit = await stabilityPool.accountDeposits(depositor);
      expect(accoutDeposit.amount).to.be.equal(amount);
      expect(accoutDeposit.timestamp).to.be.equal(now);
      // snapshots
      expect(await stabilityPool.P()).to.be.equal(initialP);
      const currentG = await stabilityPool.epochToScaleToG(0, 0);
      expect(currentG).to.be.equal(initialG);

      const lastDepositSnapshots = await stabilityPool.depositSnapshots(depositor);

      // 2. second provide
      // two days latter
      await time.increase(2 * DAY);

      const amount2 = ethers.utils.parseEther("5");
      const tx2 = await stabilityPool.provideToSP(amount2);

      const now2 = await time.latest();
      const duration = now2 - now;
      const oldRewardRate = await stabilityPool.rewardRate();
      // updateG
      const listaIssuance = oldRewardRate.mul(duration);
      const totalDebt = amount;
      const listaNumerator = listaIssuance.mul(DECIMAL_PRECISION).add(0);
      const listaPerUnitStaked = listaNumerator.div(totalDebt);
      const lastListaError = listaNumerator.mod(totalDebt);
      const newG = listaPerUnitStaked.mul(initialP).add(initialG);
      await expect(tx2).to.emit(stabilityPool, "G_Updated").withArgs(newG, 0, 0);
      expect(await stabilityPool.epochToScaleToG(0, 0)).to.be.equal(newG);
      expect(await stabilityPool.lastListaError()).to.be.equal(lastListaError);
      expect(await stabilityPool.lastUpdate()).to.be.equal(now2);

      // compoundedDebt
      const compoundedDebt = amount.mul(initialP).div(lastDepositSnapshots.P);
      const accountDeposits = await stabilityPool.accountDeposits(depositor);
      expect(accountDeposits.amount).to.be.equal(amount.add(amount2));
      expect(accountDeposits.amount).to.be.equal(compoundedDebt.add(amount2));
      expect(accountDeposits.timestamp).to.be.equal(now2);

      // accrue rewards
      const firstPortionGain = newG.sub(lastDepositSnapshots.G);
      const secondPortionGain = 0;
      const listaGain = amount.mul(firstPortionGain.add(secondPortionGain))
        .div(lastDepositSnapshots.P).div(DECIMAL_PRECISION);
      expect(await getStoredPendingReward(depositor)).to.be.equal(listaGain);

      expect(await debtToken.balanceOf(stabilityPool.address)).to.be.equal(amount.add(amount2));
      await expect(tx2).to.emit(stabilityPool, "UserDepositChanged").withArgs(depositor, amount.add(amount2));

      // pause listaCore
      await listaCore.setPaused(true);
      await expect(stabilityPool.provideToSP(amount)).to.be.revertedWith("Deposits are paused");
    });

    it("_updateG", async () => {
      // 1. totalDebt == 0
      const tx1 = await stabilityPool.updateG(100);
      expect(await stabilityPool.getTotalDebtTokenDeposits()).to.be.equal(0);
      await expect(tx1).to.not.emit(stabilityPool, "G_Updated");

      // 2. lista issuance == 0
      await stabilityPool.setTotalDebtTokenDeposit(10);
      const tx2 = await stabilityPool.updateG(0);
      expect(await stabilityPool.getTotalDebtTokenDeposits()).to.be.not.equal(0);
      await expect(tx2).to.not.emit(stabilityPool, "G_Updated");

      // 3. else
      const totalDebt = ethers.utils.parseEther("123.456");
      const currentP = initialP.sub("1234");
      const currentG = BigNumber.from("30000000");
      await stabilityPool.setTotalDebtTokenDeposit(totalDebt);
      await stabilityPool.setEpochToScaleToG(0, 0, currentG);
      await stabilityPool.setP(currentP);
      const listaIssuance = ethers.utils.parseEther("77");
      const listaPerUnitStaked = listaIssuance.mul(DECIMAL_PRECISION).div(totalDebt);

      const tx3 = await stabilityPool.updateG(listaIssuance);
      const newG = currentG.add(listaPerUnitStaked.mul(currentP));
      await expect(tx3).to.emit(stabilityPool, "G_Updated")
        .withArgs(newG, 0, 0);
    });

    it("_computeRewardsPerUnitStaked", async () => {
      const fakeTotalDebt = ethers.utils.parseEther("50000");
      const collToAdd = ethers.utils.parseEther("100");
      const debtToOffset1 = fakeTotalDebt;
      const fakeLastDebtLossError = ethers.utils.parseEther("40000");
      const fakeLastCollateralError = ethers.utils.parseEther("3000");
      await stabilityPool.setTotalDebtTokenDeposit(fakeTotalDebt);
      await stabilityPool.setLastDebtLossError_Offset(fakeLastDebtLossError);
      await stabilityPool.setLastCollateralError_Offset(0, fakeLastCollateralError);

      // 1. debtToOffset == totalDebtDeposited
      expect(debtToOffset1).to.be.equal(fakeTotalDebt);
      const tx1 = await stabilityPool.computeRewardsPerUnitStaked(
        collToAdd,
        debtToOffset1,
        fakeTotalDebt,
        0
      );
      const collNumberator1 = collToAdd.mul(DECIMAL_PRECISION).add(fakeLastCollateralError);
      await expect(tx1).to.emit(stabilityPool, "TestResult")
        .withArgs(collNumberator1.div(fakeTotalDebt), DECIMAL_PRECISION);
      expect(await stabilityPool.lastDebtLossError_Offset()).to.be.equal(0);

      // 2. debtToOffset > totalDebtDeposited
      const debtToOffset2 = fakeTotalDebt.add(ethers.utils.parseEther("10"));
      await stabilityPool.setTotalDebtTokenDeposit(fakeTotalDebt);
      await stabilityPool.setLastDebtLossError_Offset(fakeLastDebtLossError);
      await stabilityPool.setLastCollateralError_Offset(0, fakeLastCollateralError);

      expect(debtToOffset2).to.be.gt(fakeTotalDebt);
      const tx2 = await stabilityPool.computeRewardsPerUnitStaked(
        collToAdd,
        debtToOffset2,
        fakeTotalDebt,
        0
      );
      const collNumberator2 = collToAdd.mul(DECIMAL_PRECISION).add(fakeLastCollateralError);
      const debtLossNumberator2 = debtToOffset2.mul(DECIMAL_PRECISION).sub(fakeLastDebtLossError);
      await expect(tx2).to.emit(stabilityPool, "TestResult")
        .withArgs(
          collNumberator2.div(fakeTotalDebt),
          debtLossNumberator2.div(fakeTotalDebt).add(1)
        );
      expect(await stabilityPool.lastDebtLossError_Offset()).to.be.equal(fakeTotalDebt.sub(debtLossNumberator2.mod(fakeTotalDebt)));
      expect(await stabilityPool.lastCollateralError_Offset(0)).to.be.equal(collNumberator2.mod(fakeTotalDebt));

      // 3. debtToOffset < totalDebtDeposited
      const debtToOffset3 = ethers.utils.parseEther("30000");
      await stabilityPool.setTotalDebtTokenDeposit(fakeTotalDebt);
      await stabilityPool.setLastDebtLossError_Offset(fakeLastDebtLossError);
      await stabilityPool.setLastCollateralError_Offset(0, fakeLastCollateralError);

      expect(debtToOffset3).to.be.lt(fakeTotalDebt);
      const tx3 = await stabilityPool.computeRewardsPerUnitStaked(
        collToAdd,
        debtToOffset3,
        fakeTotalDebt,
        0
      );
      const collNumberator3 = collToAdd.mul(DECIMAL_PRECISION).add(fakeLastCollateralError);
      const debtLossNumberator3 = debtToOffset3.mul(DECIMAL_PRECISION).sub(fakeLastDebtLossError);
      await expect(tx3).to.emit(stabilityPool, "TestResult")
        .withArgs(
          collNumberator3.div(fakeTotalDebt),
          debtLossNumberator3.div(fakeTotalDebt).add(1)
        );
      expect(await stabilityPool.lastDebtLossError_Offset()).to.be.equal(fakeTotalDebt.sub(debtLossNumberator3.mod(fakeTotalDebt)));
      expect(await stabilityPool.lastCollateralError_Offset(0)).to.be.equal(collNumberator3.mod(fakeTotalDebt));
    });

    it("_updateRewardSumAndProduct", async () => {
      const collateralGainPerStake = BigNumber.from("123");
      const currrentP = ethers.utils.parseEther("0.998");
      const currentS = BigNumber.from("10100");
      const currentEpoch = 0;
      const currentScale = 0;
      await stabilityPool.setP(currrentP);
      await stabilityPool.setEpochToScaleToSums(currentEpoch, currentScale, 0, currentS);

      // 1. newProductFactor == 0
      const tx1 = await stabilityPool.updateRewardSumAndProduct(
        collateralGainPerStake,
        ethers.utils.parseEther("1"),
        0
      );
      const newS1 = currentS.add(collateralGainPerStake.mul(currrentP))
      await expect(tx1).to.emit(stabilityPool, "S_Updated")
        .withArgs(0, newS1, currentEpoch, currentScale);
      await expect(tx1).to.emit(stabilityPool, "EpochUpdated")
        .withArgs(currentEpoch + 1);
      await expect(tx1).to.emit(stabilityPool, "ScaleUpdated")
        .withArgs(0);
      await expect(tx1).to.emit(stabilityPool, "P_Updated")
        .withArgs(initialP);

      // 2. newProductFactor too small
      await stabilityPool.setP(currrentP);
      await stabilityPool.setEpochToScaleToSums(currentEpoch, currentScale, 0, currentS);

      const debtLossPerStake2 = BigNumber.from("999999999899799600");
      const tx2 = await stabilityPool.updateRewardSumAndProduct(
        collateralGainPerStake,
        debtLossPerStake2,
        0
      );
      await expect(tx2).to.emit(stabilityPool, "ScaleUpdated")
        .withArgs(currentScale + 1);
      const pFactor2 = DECIMAL_PRECISION.sub(debtLossPerStake2);
      const candidateNewP = currrentP.mul(pFactor2);
      expect(candidateNewP.div(DECIMAL_PRECISION)).to.be.not.equal(0);
      expect(candidateNewP.div(DECIMAL_PRECISION)).to.be.lt(scaleFactor);
      await expect(tx2).to.emit(stabilityPool, "P_Updated")
        .withArgs(candidateNewP.mul(scaleFactor).div(DECIMAL_PRECISION));
      expect(await stabilityPool.currentScale()).to.be.equal(currentScale + 1);

      // 3. newProductFactor is OK
      await stabilityPool.setP(currrentP);
      await stabilityPool.setEpochToScaleToSums(currentEpoch, currentScale, 0, currentS);

      const debtLossPerStake3 = BigNumber.from("300000");
      const tx3 = await stabilityPool.updateRewardSumAndProduct(
        collateralGainPerStake,
        debtLossPerStake3,
        0
      );
      const pFactor = DECIMAL_PRECISION.sub(debtLossPerStake3);
      expect(currrentP.mul(pFactor).div(DECIMAL_PRECISION)).to.be.gt(scaleFactor);
      await expect(tx3).to.emit(stabilityPool, "P_Updated")
        .withArgs(currrentP.mul(pFactor).div(DECIMAL_PRECISION));
      await expect(tx3).to.not.emit(stabilityPool, "EpochUpdated");
      await expect(tx3).to.not.emit(stabilityPool, "ScaleUpdated");
    });

    it("_decreaseDebt", async () => {
      const totalDebt = ethers.utils.parseEther("100");
      const amount = ethers.utils.parseEther("33");
      await stabilityPool.setTotalDebtTokenDeposit(totalDebt);

      const tx = await stabilityPool.decreaseDebt(amount);

      expect(await stabilityPool.getTotalDebtTokenDeposits()).to.be.equal(totalDebt.sub(amount));
      await expect(tx).to.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated")
        .withArgs(totalDebt.sub(amount));
    });

    it("getDepositorCollateralGain", async () => {
      const depositor = await owner.getAddress();
      await prepareCollateral(erc20Token);

      // 1. p_snapshot is 0
      const gains = await stabilityPool.getDepositorCollateralGain(depositor);
      expect(gains.length).to.be.equal(1);
      expect(gains[0]).to.be.equal(0);

      // 2. else
      // prepare
      const amount = ethers.utils.parseEther("12.345");
      await stabilityPool.provideToSP(amount);
      const initialGain = ethers.utils.parseEther("3.14");
      await stabilityPool.setCollateralGainsByDepositor(depositor, 0, initialGain);
      const S0 = ethers.utils.parseEther("4");
      const S1 = ethers.utils.parseEther("7");
      const S2 = ethers.utils.parseEther("7");
      await stabilityPool.setDepositSums(depositor, 0, S0);
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S1);
      await stabilityPool.setEpochToScaleToSums(0, 1, 0, S2);

      const gains2 = await stabilityPool.getDepositorCollateralGain(depositor);
      expect(gains2.length).to.be.equal(1);
      const firstPortion = S1.sub(S0);
      const secondProtion = S2.div(scaleFactor);
      expect(gains2[0]).to.be.equal(amount.mul(firstPortion.add(secondProtion)).div(initialP).div(DECIMAL_PRECISION).add(initialGain));
    });

    it("claimCollateralGains", async () => {
      await prepareCollateral(erc20Token);
      const amount = ethers.utils.parseEther("2");
      const depositor = await owner.getAddress();
      const receiver = await user1.getAddress();
      const S0 = ethers.utils.parseEther("0.4");
      const S1 = ethers.utils.parseEther("1.11");
      const S2 = ethers.utils.parseEther("1.23");
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S0);
      await stabilityPool.provideToSP(amount);
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S1);
      await stabilityPool.setEpochToScaleToSums(0, 1, 0, S2);

      const firstPortion = S1.sub(S0);
      const secondPortion = S2.div(scaleFactor);
      const gains = amount.mul(firstPortion.add(secondPortion)).div(initialP).div(DECIMAL_PRECISION);
      await erc20Token.transfer(stabilityPool.address, gains);

      const beforeBalance = await erc20Token.balanceOf(receiver);
      const tx = await stabilityPool.claimCollateralGains(receiver, [0]);
      const afterBalance = await erc20Token.balanceOf(receiver);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(gains);
      await expect(tx).to.emit(stabilityPool, "CollateralGainWithdrawn")
        .withArgs(depositor, [gains]);
    });

    it("claimReward", async () => {
      // 1. initialDeposit == 0
      await expect(stabilityPool.claimReward(await user1.getAddress()))
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(await owner.getAddress(), await user1.getAddress(), 0);

      // else
      const amount = ethers.utils.parseEther("12.34");
      const depositor = await owner.getAddress();
      const receiver = await user1.getAddress();
      await stabilityPool.provideToSP(amount);
      const G1 = ethers.utils.parseEther("12.3");
      const G2 = ethers.utils.parseEther("14");
      await stabilityPool.setEpochToScaleToG(0, 0, G1);
      await stabilityPool.setEpochToScaleToG(0, 1, G2);
      const currentP = initialP.sub(123);
      await stabilityPool.setP(currentP);
      await stabilityPool.accrueRewards(depositor);

      await debtToken.transfer(await user2.getAddress(), amount);
      await stabilityPool.connect(user2).provideToSP(amount);

      // check
      const snapshot = await stabilityPool.depositSnapshots(depositor);
      const firstPortion = G1.sub(snapshot.G);
      const secondPortion = G2.div(scaleFactor);
      const pendingReward = amount.mul(firstPortion.add(secondPortion)).div(snapshot.P).div(DECIMAL_PRECISION);
      const claimableReward = await stabilityPool.privateClaimableReward(depositor);
      const compoundedDebt = await stabilityPool.getCompoundedDebtDeposit(depositor);
      const debtLoss = amount.sub(compoundedDebt);
      expect(debtLoss).to.be.not.equal(0);

      const beforeBalance = await listaVault.balanceOf(receiver);
      const tx = await stabilityPool.claimReward(receiver);
      const afterBalance = await listaVault.balanceOf(receiver);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(claimableReward.add(pendingReward));
      expect((await stabilityPool.accountDeposits(depositor)).amount).to.be.equal(compoundedDebt);
      expect(await getStoredPendingReward(depositor)).to.be.equal(0);
      await expect(tx).to.emit(stabilityPool, "RewardClaimed")
        .withArgs(depositor, receiver, claimableReward.add(pendingReward));
    });

    it("vaultClaimReward", async () => {
      await expect(stabilityPool.connect(user1).vaultClaimReward(await owner.getAddress(), ZERO_ADDRESS)).to.be.reverted;

      const amount = ethers.utils.parseEther("12.34");
      const depositor = await owner.getAddress();
      await stabilityPool.provideToSP(amount);
      const G1 = ethers.utils.parseEther("12.3");
      const G2 = ethers.utils.parseEther("14");
      await stabilityPool.setEpochToScaleToG(0, 0, G1);
      await stabilityPool.setEpochToScaleToG(0, 1, G2);
      const currentP = initialP.sub(123);
      await stabilityPool.setP(currentP);
      await stabilityPool.accrueRewards(depositor);

      const data = await ethers.provider.call({
        to: listaVault.address,
        data: encodeCallData(
          "vaultClaimReward(address,address)",
          ["address", "address"],
          [stabilityPool.address, depositor]
        )
      });
      const value = abi.decode(["uint256"], data)[0];
      expect(value).to.be.equal(abi.decode(["uint256"], await ethers.provider.call({
        to: stabilityPool.address,
        data: encodeCallData(
          "innerClaimReward(address)",
          ["address"],
          [depositor]
        )
      }))[0]);
    });

    it("offset", async () => {
      await expect(stabilityPool.connect(user1).offset(erc20Token.address, 1, 0))
        .to.be.revertedWith("StabilityPool: Caller is not Liquidation Manager");

      await prepareCollateral(erc20Token);
      const collToAdd = ethers.utils.parseEther("20");
      const fakeLiquidationManager = await owner.getAddress();
      await stabilityPool.setLiquidationManager(fakeLiquidationManager);

      // 1. totalDebt == 0
      await stabilityPool.setTotalDebtTokenDeposit(0);
      await expect(stabilityPool.offset(erc20Token.address, 100, collToAdd))
        .to.not.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated");

      // 2. debtToOffset == 0
      await stabilityPool.setTotalDebtTokenDeposit(100);
      await expect(stabilityPool.offset(erc20Token.address, 0, collToAdd))
        .to.not.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated");

      // 3. debtToOffset > totalDebt
      const totalDebt3 = ethers.utils.parseEther("30000");
      const debtToOffset3 = totalDebt3.add(ethers.utils.parseEther("0.5"));
      await stabilityPool.setTotalDebtTokenDeposit(totalDebt3);
      await expect(stabilityPool.offset(erc20Token.address, debtToOffset3, collToAdd)).to.be.reverted;

      // 4. debtToOffset <= totalDebt
      // prepare
      const amount = ethers.utils.parseEther("0.33");
      const totalDebt4 = ethers.utils.parseEther("30000");
      const debtToOffset4 = ethers.utils.parseEther("1000");
      await stabilityPool.setTotalDebtTokenDeposit(totalDebt4.sub(amount));
      const emissionAmount = ethers.utils.parseEther("7000");
      await listaVault.setEmissionAmount(emissionAmount);
      const currentP = initialP.sub("500");
      await stabilityPool.setP(currentP);
      await stabilityPool.provideToSP(amount);
      const lastUpdate = await time.latest();
      const periodFinish = lastUpdate + REWARD_DURATION;
      const lastDebtLossError = BigNumber.from("50000");
      await stabilityPool.setLastDebtLossError_Offset(lastDebtLossError);
      await time.increase(2 * DAY);

      const rewardRate = emissionAmount.div(REWARD_DURATION);
      expect(await stabilityPool.rewardRate()).to.be.equal(rewardRate);
      expect(await stabilityPool.periodFinish()).to.be.equal(periodFinish);
      expect(await stabilityPool.getTotalDebtTokenDeposits()).to.be.equal(totalDebt4);

      const collAddPerStake = collToAdd.mul(DECIMAL_PRECISION).div(totalDebt4);
      const collError = collToAdd.mul(DECIMAL_PRECISION).mod(totalDebt4);

      const debtLossNumberator = debtToOffset4.mul(DECIMAL_PRECISION).sub(lastDebtLossError);
      const debtLossPerStake = debtLossNumberator.div(totalDebt4).add(1);
      const newDebtLossError = totalDebt4.sub(debtLossNumberator.mod(totalDebt4));

      // update P, S
      const pFactor = DECIMAL_PRECISION.sub(debtLossPerStake);
      expect(currentP.mul(pFactor).div(DECIMAL_PRECISION)).to.be.not.lt(scaleFactor);
      const newP = currentP.mul(pFactor).div(DECIMAL_PRECISION);
      const currentS = BigNumber.from("0");
      const newS = currentS.add(collAddPerStake.mul(currentP));

      // check
      const tx = await stabilityPool.offset(erc20Token.address, debtToOffset4, collToAdd);
      await expect(tx).to.not.emit(stabilityPool, "EpochUpdated");
      await expect(tx).to.not.emit(stabilityPool, "ScaleUpdated");
      await expect(tx).to.emit(stabilityPool, "S_Updated").withArgs(0, newS, 0, 0);
      await expect(tx).to.emit(stabilityPool, "P_Updated").withArgs(newP);
      await expect(tx).to.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated").withArgs(totalDebt4.sub(debtToOffset4));
      expect(await stabilityPool.lastCollateralError_Offset(0)).to.be.equal(collError);
      expect(await stabilityPool.lastDebtLossError_Offset()).to.be.equal(newDebtLossError);
    });

    it("withdrawFromSP", async () => {
      await expect(stabilityPool.withdrawFromSP(100)).to.be.revertedWith("StabilityPool: User must have a non-zero deposit");

      // prepare
      await prepareCollateral(erc20Token);
      const depositor = await owner.getAddress();
      const currentP = ethers.utils.parseEther("0.98");
      await stabilityPool.setP(currentP);
      const S0 = ethers.utils.parseEther("0.1");
      const S1 = ethers.utils.parseEther("0.14");
      const amount = ethers.utils.parseEther("100");
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S0);
      await stabilityPool.provideToSP(amount);
      const snapshot = await stabilityPool.depositSnapshots(depositor);
      await stabilityPool.setEpochToScaleToSums(0, 0, 0, S1);
      await time.increase(3 * DAY);
      const withdrawAmount = amount.sub(DECIMAL_PRECISION.div(3));

      // calc
      const firstPortion = S1.sub(S0);
      const secondPortion = BigNumber.from(0);
      const gain = amount.mul(firstPortion.add(secondPortion)).div(currentP).div(DECIMAL_PRECISION);
      const compoundedDebt = amount.mul(currentP).div(snapshot.P);

      const debtToWithdraw = withdrawAmount.lt(compoundedDebt) ? withdrawAmount : compoundedDebt;
      const leftDeposit = compoundedDebt.sub(debtToWithdraw);

      // check
      const tx = await stabilityPool.withdrawFromSP(withdrawAmount);
      expect(await stabilityPool.collateralGainsByDepositor(depositor, 0)).to.be.equal(gain);
      await expect(tx).to.emit(stabilityPool, "StabilityPoolDebtBalanceUpdated").withArgs(amount.sub(debtToWithdraw));
      await expect(tx).to.emit(stabilityPool, "UserDepositChanged").withArgs(depositor, leftDeposit);

      await expect(stabilityPool.call(stabilityPool.address, 10)).to.be.revertedWith("!Deposit and withdraw same block");
      // change DebtToken address should fail
      await expect(stabilityPool.setDebtToken(erc20Token.address)).to.be.revertedWith("debt tokens haven't been fully withdrawn");
    });

    it("setDebtToken", async () => {
      await expect(stabilityPool.setDebtToken(erc20Token.address)).not.to.be.reverted;
      expect(await stabilityPool.debtToken()).to.be.equal(erc20Token.address);
    });
  });
});
