import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import {
  InternalPriceFeed,
  InternalTroveManager,
  ListaMathHelper,
  MockAggregator,
  MockBorrowerOperations,
  MockDebtToken,
  MockListaCore,
  MockSortedTroves2,
  MockVault,
} from "../../../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";
import { expect } from "chai";
import { _1E18, DAY, HOUR, now, WEEK, YEAR, ZERO, ZERO_ADDRESS } from "../../utils";
import { computeCR, min } from "../../utils/math";
import {
  accrueActiveInterests,
  addTrove,
  BETA,
  calculateInterestIndex,
  CCR,
  computeStake,
  getPendingCollAndDebtRewards,
  getStoredPendingReward,
  getWeekAndDay,
  INTEREST_PRECISION,
  internalTotalActiveCollateral,
  internalTotalActiveDebt,
  MAX_INTEREST_RATE_IN_BPS,
  Status,
  SUNSETTING_INTEREST_RATE,
  VOLUME_MULTIPLIER
} from "../../utils/TroveManagerHelper";

describe("TroveManager", () => {
  let gasPool: Contract;
  let priceFeed: InternalPriceFeed;
  let listaCore: MockListaCore;
  let listaMath: ListaMathHelper;
  let debtToken: MockDebtToken;
  let collToken: MockDebtToken;
  let borrowerOperations: MockBorrowerOperations;
  let troveManager: InternalTroveManager;
  let sortedTroves: MockSortedTroves2;
  let vault: MockVault;
  let rewardToken: MockDebtToken;

  const gasCompensation = parseEther("20");

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let user4: Signer;
  let user5: Signer;
  let user6: Signer;
  let user7: Signer;
  let user8: Signer;
  let user9: Signer;
  let user10: Signer;
  let guardian: Signer;
  let userMap: Map<string, Signer>;
  let id: string;
  let id1: string;
  let id2: string;
  beforeEach(async () => {
    [owner, user1, guardian, user2, user3, user4, user5, user6, user7, user8, user9, user10] = await ethers.getSigners();
    [id, id1, id2] = [await owner.getAddress(), await user1.getAddress(), await user2.getAddress()];
    userMap = new Map<string, Signer>(Object.entries({ user1, user2, user3, user4, user5, user6, user7, user8, user9, user10 }));

    gasPool = await ethers.deployContract("GasPool", []) as Contract;
    await gasPool.deployed();

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    await listaCore.setOwner(await owner.getAddress());
    await listaCore.setGuardian(await guardian.getAddress());
    const startTime = await time.latest();
    await listaCore.setStartTime(startTime);
    await listaCore.setFeeReceiver(await owner.getAddress());

    listaMath = await ethers.deployContract("ListaMathHelper", []) as ListaMathHelper;
    await listaMath.deployed();

    debtToken = await ethers.deployContract("MockDebtToken", ["debt", "DEBT"]) as MockDebtToken;
    await debtToken.deployed();
    await debtToken.setGasPool(gasPool.address, gasCompensation);

    collToken = await ethers.deployContract("MockDebtToken", ["wBETH", "wBETH"]) as MockDebtToken;
    await collToken.deployed();

    borrowerOperations = await ethers.deployContract("MockBorrowerOperations", []) as MockBorrowerOperations;
    await borrowerOperations.deployed();

    let ethFeed = await ethers.deployContract("MockAggregator", []) as MockAggregator;
    await ethFeed.deployed();

    priceFeed = await ethers.deployContract("InternalPriceFeed", [listaCore.address, ethFeed.address]) as InternalPriceFeed;
    await priceFeed.deployed();
    let scaledPrice = ethers.utils.parseEther("2");
    let startTimestamp = await priceFeed.timestamp();
    await priceFeed.storePrice(
      ZERO_ADDRESS,
      scaledPrice,
      startTimestamp,
      2
    );
    await listaCore.setPriceFeed(priceFeed.address);

    sortedTroves = await ethers.deployContract("MockSortedTroves2", []) as MockSortedTroves2;
    await sortedTroves.deployed();

    rewardToken = await ethers.deployContract("MockDebtToken", ["reward", "REWARD"]) as MockDebtToken;
    await rewardToken.deployed();
    vault = await ethers.deployContract("MockVault", [rewardToken.address]) as MockVault;
    await vault.deployed();

    let factory = await ethers.getContractFactory("InternalTroveManager");
    troveManager = await factory.deploy(
      listaCore.address,
      gasPool.address,
      debtToken.address,
      borrowerOperations.address,
      vault.address,
      await owner.getAddress(),
      gasCompensation
    ) as InternalTroveManager;
    await troveManager.deployed();
    await troveManager.setAddresses(priceFeed.address, sortedTroves.address, collToken.address);
    await sortedTroves.setAddresses(troveManager.address);
    await borrowerOperations.setAddresses(troveManager.address, collToken.address, debtToken.address);
    await vault.setTroveManager(troveManager.address);
  })

  const registerAssignIds = async () => {
    const assignIds = [1, 2];
    await vault.notifyRegisteredId(assignIds);
  }

  const run = async (func: any, ...args: any[]) => {
    return await func(...args);
  }

  const initParameters = async () => {
    // harf-life = 40 mins
    const minDecayFactor = BigNumber.from("982820598545251060");
    const maxRedemptionFee = parseEther("0.4");
    const redemptionFeeFloor = parseEther("0.05");
    const maxBorrowFee = parseEther("0.5");
    const borrowFeeFloor = parseEther("0.06");
    const interestRateInBPS = 200;
    const maxSystemDebt = _1E18.mul(1000000);
    const MCR = parseEther("1.3");

    const lastFeeUpdateTime = BigNumber.from(await now());
    await troveManager.setLastFeeOperationTime(lastFeeUpdateTime);

    const nextTime = lastFeeUpdateTime.add(50 * 60);
    await time.setNextBlockTimestamp(nextTime);
    await troveManager.setParameters(
      minDecayFactor,
      redemptionFeeFloor,
      maxRedemptionFee,
      borrowFeeFloor,
      maxBorrowFee,
      interestRateInBPS,
      maxSystemDebt,
      MCR
    );
    const baseRate = parseEther("13");
    await troveManager.setBaseRate(baseRate);

    return {
      MCR,
      baseRate,
      interestRate: await troveManager.interestRate(),
      lastFeeUpdateTime,
      redemptionFeeFloor,
      maxRedemptionFee
    }
  }

  const findAffordableUser = async () => {
    const fee = BigNumber.from("9840030847888271169024");
    let removed = [];
    for (let [key, u] of userMap) {
      let balance = await u.getBalance();
      if (balance.gt(fee)) {
        return u;
      }
      removed.push(key);
    }
    removed.forEach(key => userMap.delete(key));
    return owner;
  }

  describe("Deployment", () => {
    it("Deploy", async () => {
      expect(await troveManager.debtToken()).to.be.equal(debtToken.address);
      expect(await troveManager.borrowerOperationsAddress()).to.be.equal(borrowerOperations.address);
      expect(await troveManager.vault()).to.be.equal(vault.address);
      expect(await troveManager.liquidationManager()).to.be.equal(await owner.getAddress());
      expect(await troveManager.LISTA_CORE()).to.be.equal(listaCore.address);
      expect(await troveManager.DEBT_GAS_COMPENSATION()).to.be.equal(gasCompensation);
    });
  })

  describe("Functions", () => {
    it("Should be right after setAddresses", async () => {
      expect(await troveManager.priceFeed()).to.be.equal(priceFeed.address);
      expect(await troveManager.sortedTroves()).to.be.equal(sortedTroves.address);
      expect(await troveManager.collateralToken()).to.be.equal(collToken.address);
      expect(await troveManager.sunsetting()).to.be.false;
      expect(await troveManager.activeInterestIndex()).to.be.equal(INTEREST_PRECISION);

      await expect(troveManager.setAddresses(priceFeed.address, sortedTroves.address, collToken.address)).to.be.reverted;
    });

    it("Should revert if not owner", async () => {
      const fakeAddress = "0x3faC4E6f6731fe56da1377994c36a10B3409895e";
      const errorMessage = "Only owner";
      await expect(troveManager.connect(user1).setPriceFeed(fakeAddress)).to.be.revertedWith(errorMessage);
      await expect(troveManager.connect(user1).startSunset()).to.be.revertedWith(errorMessage);
    });

    it("setPaused", async () => {
      await expect(troveManager.connect(guardian).setPaused(true)).to.be.not.reverted;
      await expect(troveManager.connect(guardian).setPaused(false)).to.be.revertedWith("Unauthorized");
      await expect(troveManager.connect(user1).setPaused(true)).to.be.revertedWith("Unauthorized");
      await expect(troveManager.connect(user1).setPaused(false)).to.be.revertedWith("Unauthorized");
      await expect(troveManager.connect(owner).setPaused(true)).to.be.not.reverted;
      await expect(troveManager.connect(owner).setPaused(false)).to.be.not.reverted;

      await troveManager.setPaused(true);
      expect(await troveManager.paused()).to.be.true;
      await expect(troveManager.connect(user1).setPaused(true)).to.be.revertedWith("Unauthorized");
      await expect(troveManager.connect(user1).setPaused(true)).to.be.revertedWith("Unauthorized");

      await expect(troveManager.openTrove(
        await owner.getAddress(),
        100,
        50,
        10,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false
      )).to.be.revertedWith("Collateral Paused");

      const account = await owner.getAddress();
      await expect(borrowerOperations.updateTroveFromAdjustment(
        false, true, 0, 0, false, 0,
        ZERO_ADDRESS, ZERO_ADDRESS, account, account)
      ).to.be.revertedWith("Collateral Paused");

      await troveManager.setPaused(false);
      expect(await troveManager.paused()).to.be.false;
    });

    it("collectInterests", async () => {
      await expect(troveManager.collectInterests()).to.be.revertedWith("Nothing to collect");

      const payable = parseEther("11");
      await troveManager.setInterestPayable(payable);
      const feeReceiver = await listaCore.feeReceiver();

      const beforeBalance = await debtToken.balanceOf(feeReceiver);
      await troveManager.collectInterests();
      const afterBalance = await debtToken.balanceOf(feeReceiver);
      expect(await troveManager.interestPayable()).to.be.equal(0);
      expect(afterBalance.sub(beforeBalance)).to.be.equal(payable);
    });

    it("fetchPrice", async () => {
      const price = await priceFeed.callStatic.fetchPrice(ZERO_ADDRESS);
      // 1. priceFeed != 0
      expect(await troveManager.priceFeed()).to.be.not.equal(ZERO_ADDRESS);
      expect(await troveManager.callStatic.fetchPrice()).to.be.equal(await borrowerOperations.getETHAmount(price));

      // 2. priceFeed == 0
      await troveManager.setPriceFeed(ZERO_ADDRESS);
      await troveManager.fetchPrice();
      expect(await troveManager.priceFeed()).to.be.equal(ZERO_ADDRESS);
      expect(await troveManager.callStatic.fetchPrice()).to.be.equal(await borrowerOperations.getETHAmount(price));
    });

    it("notifyRegisteredId", async () => {
      const assignIds = [1, 2];

      await expect(troveManager.notifyRegisteredId(assignIds)).to.be.reverted;
      await expect(vault.notifyRegisteredId([1, 2, 3])).to.be.revertedWith("Incorrect ID count");

      await vault.notifyRegisteredId(assignIds);
      expect(await troveManager.periodFinish()).to.be.equal(BigNumber.from(await now()).div(WEEK).mul(WEEK).add(WEEK));

      const emissionId = await troveManager.emissionId();
      expect([emissionId.debt, emissionId.minting]).to.be.deep.members(assignIds);

      await expect(vault.notifyRegisteredId(assignIds)).to.be.revertedWith("Already assigned");
    });

    it("setPriceFeed", async () => {
      const fakePriceFeed = await user1.getAddress();
      await troveManager.setPriceFeed(fakePriceFeed);
      expect(await troveManager.priceFeed()).to.be.equal(fakePriceFeed);
    });

    it("_calculateInterestIndex", async () => {
      // prepare
      let currentTime = await now();
      const interestRate = parseEther("1.33");
      await troveManager.setLastActiveIndexUpdate(currentTime - DAY);
      await troveManager.setInterestRate(interestRate);
      await troveManager.setActiveInterestIndex(parseEther("14"));

      const calcInterestResult = await calculateInterestIndex(troveManager, currentTime - DAY, interestRate, await now());
      const result = await troveManager.calculateInterestIndex();

      expect(result.currentInterestIndex).to.be.equal(calcInterestResult.currentInterestIndex);
      expect(result.interestFactor).to.be.equal(calcInterestResult.interestFactor);
    });

    it("getPendingCollAndDebtRewards", async () => {
      // 1. coll + debt == 0
      const result1 = await troveManager.getPendingCollAndDebtRewards(id);
      expect(result1).to.have.deep.members([ZERO, ZERO]);

      // 2. status != active
      const L_coll = parseEther("50");
      const L_debt = parseEther("300");
      await troveManager.setLValues(L_coll, L_debt);
      const trove = {
        debt: parseEther("10"),
        coll: parseEther("2"),
        stake: parseEther("12"),
        status: Status.closedByOwner,
        arrayIndex: 0,
        activeInterestIndex: 5,
      };
      await addTrove(troveManager, id, trove);

      const result2 = await troveManager.getPendingCollAndDebtRewards(id);
      expect(result2).to.deep.members([ZERO, ZERO]);

      // 3. normal
      trove.status = Status.active;
      await addTrove(troveManager, id, trove);

      const result3 = await troveManager.getPendingCollAndDebtRewards(id);
      expect(result3).to.deep.members([trove.stake.mul(L_coll).div(_1E18), trove.stake.mul(L_debt).div(_1E18)]);
    });

    it("_accrueActiveInterests", async () => {
      // prepare
      let currentTime = BigNumber.from(await now());
      const interestRate = parseEther("1.33");
      const lastIndexUpdateTime = currentTime.sub(DAY);
      await troveManager.setLastActiveIndexUpdate(lastIndexUpdateTime);
      await troveManager.setActiveInterestIndex(parseEther("14"));
      await troveManager.setInterestRate(interestRate);
      await troveManager.setTotalActiveDebt(parseEther("100"));
      await troveManager.setInterestPayable(parseEther("1"));
      const nextTime = BigNumber.from(await now()).add(DAY);

      await time.setNextBlockTimestamp(nextTime);
      const data = await accrueActiveInterests(troveManager, lastIndexUpdateTime, interestRate, nextTime);
      await troveManager.accrueActiveInterests();

      expect(data.interestFactor).to.be.gt(0);
      expect(await troveManager.activeInterestIndex()).to.be.equal(data.activeInterestIndex);
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(data.totalActiveDebt);
      expect(await troveManager.interestPayable()).to.be.equal(data.interestPayable);
      expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(await now());
    });

    it("startSunset", async () => {
      await troveManager.startSunset();

      expect(await troveManager.sunsetting()).to.be.true;
      expect(await troveManager.interestRate()).to.be.equal(SUNSETTING_INTEREST_RATE);
      expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(await now());
      expect(await troveManager.redemptionFeeFloor()).to.be.equal(0);
      expect(await troveManager.maxSystemDebt()).to.be.equal(0);

      const account = await owner.getAddress();
      await expect(borrowerOperations.updateTroveFromAdjustment(
        false, true, 0, 0, false, 0,
        ZERO_ADDRESS, ZERO_ADDRESS, account, account)
      ).to.be.revertedWith("Cannot increase while sunsetting");
    });

    const calcDecayedBaseRate = async (nowTime: BigNumber | number, lastTime: BigNumber, baseRate: BigNumber, minuteDecayFactor: BigNumber) => {
      const elapsedMinutes = BigNumber.from(nowTime).sub(lastTime).div(60);
      const factor = await listaMath._decPow(minuteDecayFactor, elapsedMinutes);
      return baseRate.mul(factor).div(_1E18);
    }

    it("setParameters", async () => {
      const baseRate = parseEther("13");
      await troveManager.setBaseRate(baseRate);

      // harf-life = 40 mins
      const minDecayFactor = BigNumber.from("982820598545251060");
      await troveManager.setMinuteDecayFactor(minDecayFactor);
      const maxRedemptionFee = parseEther("0.4");
      const redemptionFeeFloor = parseEther("0.05");
      const maxBorrowFee = parseEther("0.5");
      const borrowFeeFloor = parseEther("0.06");
      const interestRateInBPS = 200;
      const maxSystemDebt = _1E18.mul(1000000);
      const MCR = parseEther("1.3");

      const lastFeeUpdateTime = BigNumber.from(await now());
      await troveManager.setLastFeeOperationTime(lastFeeUpdateTime);

      const nextTime = lastFeeUpdateTime.add(50 * 60);
      await time.setNextBlockTimestamp(nextTime);
      const tx = await troveManager.setParameters(
        minDecayFactor,
        redemptionFeeFloor,
        maxRedemptionFee,
        borrowFeeFloor,
        maxBorrowFee,
        interestRateInBPS,
        maxSystemDebt,
        MCR
      );
      const timestamp = await now();
      await expect(troveManager.setParameters(
        minDecayFactor,
        redemptionFeeFloor,
        maxRedemptionFee,
        borrowFeeFloor,
        maxBorrowFee,
        interestRateInBPS,
        maxSystemDebt,
        MCR
      )).to.be.not.reverted;
      const decayedRate = await calcDecayedBaseRate(timestamp, lastFeeUpdateTime, baseRate, minDecayFactor);

      await expect(tx).to.emit(troveManager, "BaseRateUpdated").withArgs(decayedRate);
      expect(await troveManager.baseRate()).to.be.equal(decayedRate);
      expect(await troveManager.lastFeeOperationTime()).to.be.equal(timestamp);
      await expect(tx).to.emit(troveManager, "LastFeeOpTimeUpdated").withArgs(timestamp);

      expect(await troveManager.minuteDecayFactor()).to.be.equal(minDecayFactor);
      expect(await troveManager.redemptionFeeFloor()).to.be.equal(redemptionFeeFloor);
      expect(await troveManager.maxRedemptionFee()).to.be.equal(maxRedemptionFee);
      expect(await troveManager.borrowingFeeFloor()).to.be.equal(borrowFeeFloor);
      expect(await troveManager.maxBorrowingFee()).to.be.equal(maxBorrowFee);
      expect(await troveManager.maxSystemDebt()).to.be.equal(maxSystemDebt);
      expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(timestamp);
      expect(await troveManager.MCR()).to.be.equal(MCR);

      const newInterestRate = INTEREST_PRECISION.mul(interestRateInBPS).div(YEAR * 10000);
      expect(await troveManager.interestRate()).to.be.equal(newInterestRate);
      const redemptionRate = await troveManager.calcRedemptionRate(baseRate)
      expect(redemptionRate).to.be.equal(await listaMath._min(redemptionFeeFloor.add(baseRate), maxRedemptionFee));
      expect(await troveManager.getRedemptionRate()).to.be.equal(redemptionRate);
      expect(await troveManager.getRedemptionRateWithDecay()).to.be.equal(await troveManager.calcRedemptionRate(decayedRate));
      const borrowingRate = await troveManager.getBorrowingRate();
      expect(borrowingRate).to.be.equal(await listaMath._min(borrowFeeFloor.add(baseRate), maxBorrowFee));
      expect(await troveManager.getBorrowingRateWithDecay()).to.be.equal(await listaMath._min(borrowFeeFloor.add(decayedRate), maxBorrowFee))
      const debt = parseEther("50");
      expect(await troveManager.getBorrowingFee(debt)).to.be.equal(borrowingRate.mul(debt).div(_1E18));
      expect(await troveManager.getBorrowingFeeWithDecay(debt)).to.be.equal((await troveManager.getBorrowingRateWithDecay()).mul(debt).div(_1E18));
      expect(await borrowerOperations.callStatic.decayBaseRateAndGetBorrowingFee(debt)).to.be.equal(borrowingRate.mul(debt).div(_1E18));

      await expect(troveManager.setParameters(0, 0, 0, 0, 0, 0, 0, CCR.add(1)))
        .to.be.revertedWith("MCR cannot be > CCR or < 110%");
      await expect(troveManager.setParameters(0, 0, 0, 0, 0, 0, 0, BigNumber.from("1100000000000000000").sub(1)))
        .to.be.revertedWith("MCR cannot be > CCR or < 110%");
      await expect(troveManager.connect(user1).setParameters(1, 0, 0, 0, 0, 0, 0, MCR))
        .to.be.revertedWith("Only owner");
      await expect(troveManager.setParameters(BigNumber.from("977159968434245000").sub(1), 0, 0, 0, 0, 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(BigNumber.from("999931237762985000").add(1), 0, 0, 0, 0, 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 1, 0, 0, 0, 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 0, _1E18.add(1), 0, 0, 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 0, 0, 0, 0, 0, 0, MCR))
        .to.be.not.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 0, 0, 1, 0, 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 0, 0, 0, _1E18.add(1), 0, 0, MCR))
        .to.be.reverted;
      await expect(troveManager.setParameters(minDecayFactor, 0, 0, 0, 0, MAX_INTEREST_RATE_IN_BPS + 1, 0, MCR))
        .to.be.revertedWith("Interest > Maximum");

      await troveManager.startSunset();
      await expect(troveManager.setParameters(0, 0, 0, 0, 0, 0, 0, 0))
        .to.be.revertedWith("Cannot change after sunset");
    });

    it("getWeekAndDay", async () => {
      const duration = BigNumber.from(74 * DAY);
      const newNow = BigNumber.from(await now()).add(duration);
      await time.increaseTo(newNow);

      const result = getWeekAndDay(duration);
      const data = await troveManager.getWeekAndDay();
      expect(data).to.be.deep.members([result.week, result.day]);
    });

    it("getPendingCollAndDebtRewards and getEntireDebtAndColl and getEntireSystemDebt and getTroveCollAndDebt", async () => {
      const L_coll = parseEther("100");
      const L_debt = parseEther("20");
      await troveManager.setLValues(L_coll, L_debt);
      const stake = parseEther("2");
      const interestIndex = parseEther("0.32");
      const snapshot = {
        collateral: parseEther("10"),
        debt: parseEther("4"),
      }
      await troveManager.setRewardSnapshots(await owner.getAddress(), snapshot.collateral, snapshot.debt);
      await addTrove(troveManager, id, {
        coll: snapshot.collateral,
        debt: snapshot.debt,
        stake,
        status: Status.active,
        arrayIndex: 0,
        activeInterestIndex: interestIndex
      });
      const lastActiveIndexUpdateTime = await now();
      await troveManager.setLastActiveIndexUpdate(lastActiveIndexUpdateTime);
      const activeInterestIndex = parseEther("0.3");
      await troveManager.setActiveInterestIndex(activeInterestIndex);
      const interestRate = parseEther("0.55");
      await troveManager.setInterestRate(interestRate);

      await time.increaseTo(BigNumber.from(await now()).add(2 * DAY));

      // getPendingCollAndDebtRewards
      const result = getPendingCollAndDebtRewards(stake, snapshot, L_coll, L_debt);
      let indexInfo = await calculateInterestIndex(troveManager, lastActiveIndexUpdateTime, interestRate, await now());
      const data = await troveManager.getPendingCollAndDebtRewards(await owner.getAddress());
      expect(data).to.be.deep.members([result.pendingColl, result.pendingDebt]);

      // getEntireDebtAndColl
      const accrueDebt = snapshot.debt.mul(indexInfo.currentInterestIndex).div(interestIndex);
      const debt = accrueDebt.add(result.pendingDebt);
      const coll = snapshot.collateral.add(result.pendingColl);
      const entireValues = await troveManager.getEntireDebtAndColl(await owner.getAddress());
      const collAndDebt = await troveManager.getTroveCollAndDebt(await owner.getAddress());
      const price = BigNumber.from("4444444");
      expect(await troveManager.getCurrentICR(await owner.getAddress(), price)).to.be.equal(await listaMath["_computeCR(uint256,uint256,uint256)"](collAndDebt.coll, collAndDebt.debt, price));
      expect(await troveManager.getNominalICR(await owner.getAddress())).to.be.equal(await listaMath._computeNominalCR(collAndDebt.coll, collAndDebt.debt));
      expect(entireValues.debt).to.be.equal(debt);
      expect(entireValues.coll).to.be.equal(coll);
      expect(entireValues.pendingCollateralReward).to.be.equal(result.pendingColl);
      expect(entireValues.pendingDebtReward).to.be.equal(result.pendingDebt);
      expect(collAndDebt.coll).to.be.equal(coll);
      expect(collAndDebt.debt).to.be.equal(debt);

      // getEntireSystemDebt
      const totalActiveDebt = parseEther("3")
      await troveManager.setTotalActiveDebt(totalActiveDebt);
      indexInfo = await calculateInterestIndex(troveManager, lastActiveIndexUpdateTime, interestRate, await now());
      expect(await troveManager.getEntireSystemDebt()).to.be.equal(totalActiveDebt.add(totalActiveDebt.mul(indexInfo.interestFactor).div(INTEREST_PRECISION)));
    });

    it("_updateBaseRateFromRedemption", async () => {
      const lastFeeUpdateTime = BigNumber.from(await now());
      await troveManager.setLastFeeOperationTime(lastFeeUpdateTime);
      const baseRate = parseEther("0.012");
      await troveManager.setBaseRate(baseRate);
      const minDecayFactor = BigNumber.from("977159968434245954");
      await troveManager.setMinuteDecayFactor(minDecayFactor);
      const collDraw = parseEther("3");
      const price = BigNumber.from("123456789");
      const totalDebt = parseEther("0.08");

      const timepassed = 60 * 70;
      await time.setNextBlockTimestamp(lastFeeUpdateTime.add(timepassed));
      const tx = await troveManager.updateBaseRateFromRedemption(collDraw, price, totalDebt);
      const decayedBaseRate = await calcDecayedBaseRate(await now(), lastFeeUpdateTime, baseRate, minDecayFactor);
      const deptFraction = collDraw.mul(price).div(totalDebt);
      let newBaseRate = decayedBaseRate.add(deptFraction.div(BETA));
      newBaseRate = newBaseRate.lt(_1E18) ? newBaseRate : _1E18;

      await expect(tx).to.emit(troveManager, "BaseRateUpdated").withArgs(newBaseRate);
      await expect(tx).to.emit(troveManager, "LastFeeOpTimeUpdated").withArgs(await now());
    });

    it("_calcRedemptionFee and getRedemptionFeeWithDecay", async () => {
      const lastFeeUpdateTime = await now();
      await troveManager.setLastFeeOperationTime(lastFeeUpdateTime);
      const redemptionRate = parseEther("0.003");
      const redemptionRateError = parseEther("2");
      const collDrawn = parseEther("100");
      const fee = collDrawn.mul(redemptionRate).div(_1E18);
      const minDecayFactor = BigNumber.from("977159968434245954");
      await troveManager.setMinuteDecayFactor(minDecayFactor);
      const baseRate = parseEther("12");
      await troveManager.setBaseRate(baseRate);

      await time.increase(5 * 60);

      await expect(troveManager.calcRedemptionFee(redemptionRateError, collDrawn)).to.be.revertedWith("Fee exceeds returned collateral");
      expect(await troveManager.calcRedemptionFee(redemptionRate, collDrawn)).to.be.equal(fee);
      expect(await troveManager.getRedemptionFeeWithDecay(parseEther("3"))).to.be.equal(await troveManager.calcRedemptionFee(await troveManager.getRedemptionRateWithDecay(), parseEther("3")));
    });

    it("_updateMintVolume", async () => {
      const startTime = await listaCore.startTime();
      await time.increase(50 * 60);
      const days = getWeekAndDay(BigNumber.from(await now()).sub(startTime));
      const debtAmount = parseEther("777");
      const amount = debtAmount.div(VOLUME_MULTIPLIER);

      // 1st
      await troveManager.updateMintVolume(await owner.getAddress(), debtAmount);

      const totalMints = await troveManager.getTotalMints(days.week);
      const userLatestMints = await troveManager.accountLatestMint(await owner.getAddress());
      expect(totalMints[days.day.toNumber()]).to.be.equal(amount);
      expect(userLatestMints.amount).to.be.equal(amount);
      expect(userLatestMints.week).to.be.equal(days.week);
      expect(userLatestMints.day).to.be.equal(days.day);

      // 2nd the same week and day
      await time.increase(3 * HOUR);
      const days2 = getWeekAndDay(BigNumber.from(await now()).sub(startTime));
      await troveManager.updateMintVolume(await owner.getAddress(), debtAmount);

      const totalMints2 = await troveManager.getTotalMints(days2.week);
      expect(totalMints2[days2.day.toNumber()]).to.be.equal(totalMints[days.day.toNumber()] + amount.toNumber());
      const userLatestMints2 = await troveManager.accountLatestMint(await owner.getAddress());
      expect(userLatestMints2.amount).to.be.equal(amount.mul(2));
      expect(userLatestMints2.week).to.be.equal(days2.week);
      expect(userLatestMints2.day).to.be.equal(days2.day);

      // 3rd, another week
      await time.increase(1.5 * WEEK);
      const days3 = getWeekAndDay(BigNumber.from(await now()).sub(startTime));
      await troveManager.updateMintVolume(await owner.getAddress(), debtAmount);

      const totalMints3 = await troveManager.getTotalMints(days3.week);
      expect(totalMints3[days3.day.toNumber()]).to.be.equal(amount);
      const userLatestMints3 = await troveManager.accountLatestMint(await owner.getAddress());
      expect(userLatestMints3.amount).to.be.equal(amount);
      expect(userLatestMints3.week).to.be.equal(days3.week);
      expect(userLatestMints3.day).to.be.equal(days3.day);
    });

    it("hasPendingRewards is false", async () => {
      const trove = {
        debt: 1,
        coll: 2,
        stake: 3,
        status: Status.closedByOwner,
        arrayIndex: 4,
        activeInterestIndex: 5,
      };
      await addTrove(troveManager, id, trove);

      expect(await troveManager.hasPendingRewards(id)).to.be.false;
    });

    it("_isValidFirstRedemptionHint", async () => {
      const price = parseEther("0.23")
      const MCR = parseEther("5");
      // 1. zero address
      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, ZERO_ADDRESS, price, MCR)).to.be.false;

      // 2. not contains
      const fakeAddress = "0x3faC4E6f6731fe56da1377994c36a10B3409895e";
      expect(await sortedTroves.contains(fakeAddress)).to.be.false;
      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, fakeAddress, price, MCR)).to.be.false;

      // 3. < MCR
      const trove = {
        debt: parseEther("100"),
        coll: parseEther("11"),
        stake: parseEther("98"),
        status: Status.active,
        activeInterestIndex: ZERO,
        arrayIndex: 0
      };
      await addTrove(troveManager, fakeAddress, trove);
      await troveManager.setLValues(parseEther("100"), parseEther("33"));
      await sortedTroves.insert(fakeAddress, computeCR(trove.coll, trove.debt), ZERO_ADDRESS, ZERO_ADDRESS);

      expect(await sortedTroves.contains(fakeAddress)).to.be.true;
      expect(await troveManager.getCurrentICR(fakeAddress, price)).to.be.lt(MCR);
      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, fakeAddress, price, MCR)).to.be.false;

      // 4.
      const ICR = computeCR(trove.coll, trove.debt);
      const MCR4 = parseEther("0.15");
      await sortedTroves.insert(fakeAddress, ICR, ZERO_ADDRESS, ZERO_ADDRESS);
      expect(await sortedTroves.contains(fakeAddress)).to.be.true;
      expect(await sortedTroves.getNext(fakeAddress)).to.be.equal(ZERO_ADDRESS);
      expect(await troveManager.getCurrentICR(fakeAddress, price)).to.be.gt(MCR4);
      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, fakeAddress, price, MCR4)).to.be.true;

      trove.coll = trove.coll.div(2);
      trove.arrayIndex++;
      await addTrove(troveManager, id, trove);
      await sortedTroves.insert(fakeAddress, ICR, ZERO_ADDRESS, id);
      const MCR5 = parseEther("0.676633923215357");
      expect(await sortedTroves.getNext(fakeAddress)).to.be.equal(id);
      expect(await troveManager.getCurrentICR(fakeAddress, price)).to.be.gt(MCR5);
      expect(await troveManager.getCurrentICR(id, price)).to.be.lt(MCR5);
      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, fakeAddress, price, MCR5)).to.be.true;
    });

    it("claimReward", async () => {
      await registerAssignIds();
      // 1. amount <= 0
      const tx1 = await troveManager.claimReward(id1);
      await expect(tx1).to.emit(troveManager, "RewardClaimed").withArgs(id, id1, 0);

      // 2. else
      await rewardToken.mint(vault.address, parseEther("1000"));
      await troveManager.updateIntegralForAccount(id, parseEther("123"), _1E18);
      const tx2 = await troveManager.claimReward(id1);
      await expect(tx2).to.emit(troveManager, "RewardClaimed").withArgs(id, id1, parseEther("123"));
    });

    it("_redeemCloseTrove", async () => {
      const totalDebt = parseEther("1111");
      const totalColl = parseEther("333");
      const debt = parseEther("100");
      const coll = parseEther("33");
      await debtToken.mint(gasPool.address, debt);
      await troveManager.setTotalActiveDebt(totalDebt);
      await troveManager.setTotalActiveColl(totalColl);

      const beforeBalance = await debtToken.balanceOf(gasPool.address);
      await troveManager.redeemCloseTrove(id, debt, coll);
      const afterBalance = await debtToken.balanceOf(gasPool.address);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(debt.mul(-1));
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(totalDebt.sub(debt));
      expect(await internalTotalActiveCollateral(troveManager)).to.be.equal(totalColl.sub(coll));
      expect(await troveManager.surplusBalances(id)).to.be.equal(coll);
    });

    it("_claimReward", async () => {
      await expect(troveManager.innerClaimReward(id)).to.be.revertedWith("Rewards not active");

      await registerAssignIds();
      const volume = VOLUME_MULTIPLIER.mul(100);
      await troveManager.updateMintVolume(id, volume);
      await troveManager.updateMintVolume(id1, VOLUME_MULTIPLIER.mul(33));
      const dailyRewardRate = parseEther("0.001");
      await troveManager.setDailyMintReward(0, dailyRewardRate);
      const mintReward = dailyRewardRate.mul(volume.div(VOLUME_MULTIPLIER)).div((await troveManager.getTotalMints(0))[0]);
      expect(mintReward).to.be.gt(0);
      const currentIntegral = parseEther("13");
      await troveManager.updateIntegralForAccount(id, _1E18, currentIntegral);
      const storedPendingReward = _1E18.mul(currentIntegral).div(_1E18);
      expect(await getStoredPendingReward(troveManager, id)).to.be.equal(storedPendingReward);

      await time.increase(WEEK);
      expect(await troveManager.callStatic.innerClaimReward(id)).to.be.equal(storedPendingReward.add(mintReward));
      await expect(troveManager.vaultClaimReward(id, ZERO_ADDRESS)).to.be.reverted;
      expect(await vault.callStatic.vaultClaimReward(id, ZERO_ADDRESS)).to.be.equal(storedPendingReward.add(mintReward));

      await troveManager.innerClaimReward(id)
      expect(await getStoredPendingReward(troveManager, id)).to.be.equal(0);
      const latestMint = await troveManager.accountLatestMint(id);
      expect(latestMint.amount).to.be.equal(0);
      expect(latestMint.week).to.be.equal(0);
      expect(latestMint.day).to.be.equal(0);
    });

    it("_getPendingMintReward", async () => {
      const volume = VOLUME_MULTIPLIER.mul(100);
      await troveManager.updateMintVolume(id, volume);
      await troveManager.updateMintVolume(id1, VOLUME_MULTIPLIER.mul(33));
      const dailyRewardRate = parseEther("0.001");
      await troveManager.setDailyMintReward(0, dailyRewardRate);

      expect(await troveManager.getPendingMintReward(id)).to.be.equal(0);

      // different day
      await time.increase(DAY);
      expect(await troveManager.getPendingMintReward(id))
        .to.be.equal(dailyRewardRate.mul(volume.div(VOLUME_MULTIPLIER)).div((await troveManager.getTotalMints(0))[0]));

      // different week
      await time.increase(WEEK);
      expect(await troveManager.getPendingMintReward(id))
        .to.be.equal(dailyRewardRate.mul(volume.div(VOLUME_MULTIPLIER)).div((await troveManager.getTotalMints(0))[0]));
    });

    it("getTotalActiveDebt", async () => {
      const interestRate = parseEther("0.011");
      await troveManager.setInterestRate(interestRate);
      const lastActiveIndexUpdate = await time.latest();
      await troveManager.setLastActiveIndexUpdate(lastActiveIndexUpdate);
      const totalActiveDebt = parseEther("100");
      await troveManager.setTotalActiveDebt(totalActiveDebt);
      const deltaT = 1.5 * DAY;
      const nextTime = await time.latest() + deltaT;

      const interestInfo = await calculateInterestIndex(troveManager, lastActiveIndexUpdate, interestRate, nextTime);

      await time.increaseTo(nextTime);
      expect(interestInfo.interestFactor).to.be.gt(0);
      expect(await troveManager.getTotalActiveDebt()).to.be.equal(totalActiveDebt.mul(INTEREST_PRECISION.add(interestInfo.interestFactor)).div(INTEREST_PRECISION))
    });

    it("_updateRewardIntegral", async () => {
      expect(await troveManager.callStatic.updateRewardIntegral(0)).to.be.equal(0);

      const periodFinish = await time.latest() + WEEK;
      await troveManager.setPeriodFinish(periodFinish);
      const lastUpdate = await time.latest() + DAY;
      await troveManager.setLastUpdate(lastUpdate);
      const nextTime = lastUpdate + 3.4 * DAY;
      const supply1 = 0;

      await time.increase(BigNumber.from(DAY).mul(11).div(10));
      expect(await time.latest()).to.be.gt(lastUpdate);
      expect(supply1).to.be.equal(0);

      // await troveManager.updateRewardIntegral(supply1);
      expect(await troveManager.callStatic.updateRewardIntegral(supply1)).to.be.equal(0);

      const supply2 = parseEther("111");
      const rewardRate = parseEther("0.11");
      await troveManager.setRewardRate(rewardRate);

      await time.increaseTo(nextTime);
      const duration = nextTime - lastUpdate;
      expect(await troveManager.rewardIntegral()).to.be.equal(0);
      expect(await troveManager.callStatic.updateRewardIntegral(supply2)).to.be.equal(rewardRate.mul(duration).mul(_1E18).div(supply2));
    });

    it("_increaseDebt", async () => {
      const maxSystemDebt = parseEther("1000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);
      const defaultDebt = parseEther("30");
      await troveManager.setDefaultedCollAndDebt(100, defaultDebt);
      const totalActiveDebt = parseEther("70");
      await troveManager.setTotalActiveDebt(totalActiveDebt);

      // 1. invalid
      const debt = parseEther("950");
      const netDebt = debt.add(gasCompensation);

      expect(totalActiveDebt.add(netDebt).add(defaultDebt)).to.be.gt(maxSystemDebt);
      await expect(troveManager.increaseDebt(id, netDebt, debt)).to.be.revertedWith("Collateral debt limit reached");

      // 2. valid
      const debt2 = parseEther("20");
      const netDebt2 = debt2.add(gasCompensation);
      const beforeBalance = await debtToken.balanceOf(id1);

      expect(totalActiveDebt.add(netDebt2).add(defaultDebt)).to.be.lte(maxSystemDebt);
      await troveManager.increaseDebt(id1, netDebt2, debt2);

      const afterBalance = await debtToken.balanceOf(id1);
      expect(afterBalance.sub(beforeBalance)).to.be.equal(debt2);
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(totalActiveDebt.add(netDebt2));
    });

    it("updateTroveFromAdjustment", async () => {
      await expect(troveManager.updateTroveFromAdjustment(
        false,
        false,
        0,
        0,
        false,
        0,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      )).to.be.revertedWith("Caller not BO");

      const trove = {
        debt: parseEther("100"),
        coll: parseEther("30"),
        stake: parseEther("14"),
        status: Status.active,
        arrayIndex: 0,
        activeInterestIndex: parseEther("0.123"),
      };
      await addTrove(troveManager, id, trove);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);
      const totalStakes = parseEther("500")
      await troveManager.setTotalStakes(totalStakes);
      const debtChange = parseEther("6");
      const netDebtChange = debtChange.add(gasCompensation);
      const tx = await borrowerOperations.updateTroveFromAdjustment(
        true,
        true,
        debtChange,
        netDebtChange,
        false,
        0,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        id,
        id1
      );

      const newDebt = trove.debt.add(netDebtChange)
      const newStake = trove.coll;

      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(
          id,
          newDebt,
          trove.coll,
          newStake,
          2
        );
    });

    it("_computeNewStake", async () => {
      // 1. coll snapshot == 0
      const coll1 = parseEther("13");
      expect(await troveManager.computeNewStake(coll1)).to.be.equal(coll1);

      // 2. else
      const totalCollSnapshot = parseEther("1111");
      const totalStakesSnapshot = parseEther("765");
      await troveManager.setTotalCollateralSnapshot(totalCollSnapshot);
      await troveManager.setTotalStakesSnapshot(totalStakesSnapshot);

      const coll2 = parseEther("137");
      expect(totalCollSnapshot).to.be.gt(0);
      expect(totalStakesSnapshot).to.be.gt(0);
      const stake = coll2.mul(totalStakesSnapshot).div(totalCollSnapshot);
      expect(await troveManager.computeNewStake(coll2)).to.be.equal(stake);
    });

    it("claimableReward", async () => {
      const integralFor = parseEther("111");
      await troveManager.updateIntegralForAccount(id, _1E18, integralFor);
      const rewardIntegral = parseEther("174");
      await troveManager.setRewardIntegral(rewardIntegral);
      const storedPendingReward = await getStoredPendingReward(troveManager, id);
      const now = await time.latest();
      const periodFinish = now + WEEK;
      await troveManager.setPeriodFinish(periodFinish);
      const lastUpdate = now + 2 * DAY;
      await troveManager.setLastUpdate(lastUpdate);
      const totalActiveDebt = parseEther("100");
      await troveManager.setTotalActiveDebt(totalActiveDebt);
      const rewardRate = parseEther("0.333");
      await troveManager.setRewardRate(rewardRate);

      const trove = {
        coll: parseEther("10"),
        debt: parseEther("7"),
        stake: parseEther("11"),
        status: Status.active,
        arrayIndex: 0,
        activeInterestIndex: parseEther("0.123")
      }
      await addTrove(troveManager, id, trove);

      const nextTime = now + 3 * DAY;
      expect(lastUpdate).to.be.lt(periodFinish);
      expect(nextTime).to.be.lt(periodFinish);
      expect(nextTime).to.be.gt(lastUpdate);

      await time.increaseTo(nextTime);
      const duration = nextTime - lastUpdate;
      const integral = rewardIntegral.add(rewardRate.mul(duration).mul(_1E18).div(totalActiveDebt));
      let amount = storedPendingReward.add(trove.debt.mul(integral.sub(integralFor)).div(_1E18));
      expect(await troveManager.claimableReward(id)).to.be.equal(amount);
    });

    it("claimableReward2", async () => {
      const integralFor = parseEther("111");
      await troveManager.updateIntegralForAccount(id, _1E18, integralFor);
      const rewardIntegral = parseEther("174");
      await troveManager.setRewardIntegral(rewardIntegral);
      const storedPendingReward = await getStoredPendingReward(troveManager, id);
      const now = await time.latest();
      const periodFinish = now + WEEK;
      await troveManager.setPeriodFinish(periodFinish);
      const lastUpdate = now + 2 * DAY;
      await troveManager.setLastUpdate(lastUpdate);
      const totalActiveDebt = ZERO;
      await troveManager.setTotalActiveDebt(totalActiveDebt);
      const rewardRate = parseEther("0.333");
      await troveManager.setRewardRate(rewardRate);

      const trove = {
        coll: parseEther("10"),
        debt: parseEther("7"),
        stake: parseEther("11"),
        status: Status.active,
        arrayIndex: 0,
        activeInterestIndex: parseEther("0.123")
      }
      await addTrove(troveManager, id, trove);

      // supply = 0
      await time.increaseTo(periodFinish);
      expect(totalActiveDebt).to.be.equal(0);
      const integral = rewardIntegral;
      let amount = storedPendingReward.add(trove.debt.mul(integral.sub(integralFor)).div(_1E18));
      expect(await troveManager.claimableReward(id)).to.be.equal(amount);
    });

    it("_fetchRewards", async () => {
      let periodFinish = await time.latest() + WEEK;
      // 1. emissionId.debt = 0
      await expect(troveManager.fetchRewards(periodFinish)).to.be.not.reverted;

      // 2. now < period finish
      const assignIds = [1, 2];
      await vault.notifyRegisteredId(assignIds);

      expect(await time.latest()).to.be.lt(periodFinish);
      await expect(troveManager.fetchRewards(periodFinish)).to.be.not.reverted;
    });

    it("_fetchRewards2", async () => {
      const assignIds = [1, 2];
      await vault.notifyRegisteredId(assignIds);

      const startTime = await listaCore.startTime();
      const periodFinish = startTime.add(WEEK + 3 * DAY);
      await troveManager.setPeriodFinish(periodFinish);

      const debtEmissionRewarwd = parseEther("333");
      const mintEmissionRewarwd = parseEther("1000");
      await vault.setEmissionAmount(assignIds[0], debtEmissionRewarwd);
      await vault.setEmissionAmount(assignIds[1], mintEmissionRewarwd);
      const rewardRate = parseEther("0.123");
      await troveManager.setRewardRate(rewardRate);

      await time.setNextBlockTimestamp(startTime.add(WEEK + DAY));
      await troveManager.fetchRewards(periodFinish);

      const now = await time.latest();
      const remaining = periodFinish.sub(now);
      expect(remaining).to.be.gt(0);
      let amount = debtEmissionRewarwd.add(rewardRate.mul(remaining));
      const newRewardRate = amount.div(WEEK);
      expect(await troveManager.rewardRate()).to.be.equal(newRewardRate);
      expect(await troveManager.lastUpdate()).to.be.equal(now);
      expect(await troveManager.periodFinish()).to.be.equal(now + WEEK);
      expect(await troveManager.dailyMintReward(1)).to.be.equal(mintEmissionRewarwd.div(7));
    });

    it("_closeTrove", async () => {
      const coll = parseEther("800");
      const debt = parseEther("300").add(gasCompensation);
      const NICR = computeCR(coll, debt);
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      await collToken.setReturnedCollateralAmount(coll);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);
      let params = [
        id,
        coll,
        debt,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false,
        { value: ethAmount }]
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...params);
      params[0] = id1;
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...params);
      params[0] = id2;
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...params);

      // check
      expect(await sortedTroves.contains(id)).to.be.true;
      const tx = await troveManager.innerCloseTrove(id, Status.closedByOwner);
      await expect(tx).to.emit(troveManager, "TroveIndexUpdated")
        .withArgs(id2, 0);
      expect(await troveManager.getTroveOwnersCount()).to.be.equal(2);
      expect(await sortedTroves.contains(id)).to.be.false;
      const firstTrove = await troveManager.Troves(id2);
      expect(firstTrove.arrayIndex).to.be.equal(0);
      expect(firstTrove.status).to.be.equal(Status.active);
    });

    it("openTrove", async () => {
      await initParameters();
      const ethAmount = parseEther("3");
      await collToken.setReturnedCollateralAmount(ethAmount);
      const coll = ethAmount;
      const debt = parseEther("0.005");
      const NICR = computeCR(coll, debt);

      const borrower1 = await owner.getAddress();
      await expect(borrowerOperations.openTrove(
        borrower1,
        coll,
        parseEther("2000000"),
        NICR,
        borrower1,
        borrower1,
        false,
        { value: ethAmount }
      ))
        .to.be.revertedWith("Collateral debt limit reached");

      const params = [
        borrower1,
        coll,
        debt,
        NICR,
        borrower1,
        borrower1,
        false,
        { value: ethAmount }
      ];
      const tx = await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...params);
      await expect(borrowerOperations.openTrove(borrower1, 0, 0, 0, borrower1, borrower1, false, { value: ethAmount }))
        .to.be.revertedWith("BorrowerOps: Trove is active");

      const totalStakeSnapshot = await troveManager.totalStakesSnapshot();
      const totalCollSnapshot = await troveManager.totalCollateralSnapshot();
      const stake = computeStake(coll, totalCollSnapshot, totalStakeSnapshot);
      await expect(tx).to.emit(troveManager, "TotalStakesUpdated")
        .withArgs(totalStakeSnapshot.add(stake));
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(await owner.getAddress(), debt, coll, stake, 0);
      const trove = await troveManager.Troves(await owner.getAddress());
      expect(trove.coll).to.be.equal(coll);
      expect(trove.debt).to.be.equal(debt);
      expect(trove.stake).to.be.equal(stake);
      expect(trove.status).to.be.equal(1);
      expect(trove.arrayIndex).to.be.equal(0);

      const coll2 = parseEther("10");
      await collToken.setReturnedCollateralAmount(coll2);
      const debt2 = parseEther("0.03");
      const NICR2 = computeCR(coll2, debt2);
      const borrower2 = await user1.getAddress();
      const params2 = [
        borrower2,
        coll2,
        debt2,
        NICR2,
        borrower2,
        borrower2,
        true,
        { value: coll2 }
      ];
      const tx2 = await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...params2);

      const stake2 = computeStake(coll2, totalCollSnapshot, totalStakeSnapshot);
      await expect(tx2).to.emit(troveManager, "TroveUpdated")
        .withArgs(await user1.getAddress(), debt2, coll2, stake2, 0);

      expect(await troveManager.getTroveOwnersCount()).to.be.equal(2);
      expect(await troveManager.getTroveFromTroveOwnersArray(1)).to.be.equal(await user1.getAddress());
      expect(await troveManager.getTroveStatus(await user1.getAddress())).to.be.equal(1);
      expect(await troveManager.getTroveStake(await user1.getAddress())).to.be.equal(stake2);
      expect(await troveManager.getEntireSystemColl()).to.be.equal(coll.add(coll2));
      expect(await troveManager.getTotalActiveCollateral()).to.be.equal(coll.add(coll2));
      const entireBalances = await troveManager.callStatic.getEntireSystemBalances();
      expect(entireBalances).to.be.deep.members([coll.add(coll2), debt.add(debt2), await troveManager.callStatic.fetchPrice()]);

      const interestInfo = await calculateInterestIndex(
        troveManager,
        await troveManager.lastActiveIndexUpdate(),
        await troveManager.interestRate(),
        await now()
      );
      const totalActiveDebt = debt.add(debt2);
      const activeDebt = totalActiveDebt.mul(interestInfo.interestFactor).div(INTEREST_PRECISION).add(totalActiveDebt);
      expect(await troveManager.getTotalActiveDebt()).to.be.equal(activeDebt);

      expect(await troveManager.hasPendingRewards(await owner.getAddress())).to.be.false;

      // sunsetting
      await troveManager.startSunset();
      await expect(troveManager.openTrove(
        await owner.getAddress(),
        0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, false
      )).to.be.revertedWith("Caller not BO");
      await expect(borrowerOperations.openTrove(
        await owner.getAddress(),
        0, 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, false
      )).to.be.revertedWith("Cannot open while sunsetting");
    });

    it("closeTrove", async () => {
      await initParameters();
      const coll = parseEther("3");
      const debt = parseEther("0.005");
      const NICR = computeCR(coll, debt);
      await collToken.setReturnedCollateralAmount(coll);

      const account = await owner.getAddress();
      const openParams = [
        account,
        coll,
        debt,
        NICR,
        account,
        account,
        false
      ]
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);

      const closeParams = [
        account,
        account,
        coll,
        debt
      ];
      const tx = await run(borrowerOperations.connect(await findAffordableUser()).closeTrove, ...closeParams);
      const blockTime = await now();
      await expect(borrowerOperations.updateTroveFromAdjustment(
        false,
        true,
        0, 0, true, 0, ZERO_ADDRESS, ZERO_ADDRESS, account, account
      )).to.be.revertedWith("Trove closed or does not exist");
      await expect(borrowerOperations.closeTrove(
        account,
        account,
        coll,
        debt
      )).to.be.revertedWith("Trove closed or does not exist");

      const trove = await troveManager.Troves(account);
      expect(trove.stake).to.be.equal(0);
      expect(trove.coll).to.be.equal(0);
      expect(trove.debt).to.be.equal(0);
      expect(trove.activeInterestIndex).to.be.equal(0);
      expect(trove.arrayIndex).to.be.equal(0);

      await expect(tx).to.not.emit(troveManager, "TroveIndexUpdated");
      expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(blockTime);
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(0);
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(account, 0, 0, 0, 1);
    });

    it("_redeemCollateralFromTrove if newDebt == GAS_COMPENSATION", async () => {
      const coll = parseEther("800");
      const debt = parseEther("300").add(gasCompensation);
      const NICR = computeCR(coll, debt);
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      await collToken.setReturnedCollateralAmount(coll);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);

      const openParams = [
        id,
        coll,
        debt,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);
      const price = parseEther("0.456");
      const maxDebtAmount = parseEther("400");
      const debtLot = min(maxDebtAmount, debt.sub(gasCompensation));
      const newDebt = debt.sub(debtLot);
      const collLot = debtLot.mul(_1E18).div(price);
      expect(newDebt).to.be.equal(gasCompensation);

      const result = await troveManager.callStatic.redeemCollateralFromTrove(sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, 0);
      expect(result.debtLot).to.be.equal(debtLot);
      expect(result.collateralLot).to.be.equal(collLot);
      const redeemParams = [
        sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, 0
      ];
      const tx = await run(troveManager.connect(await findAffordableUser()).redeemCollateralFromTrove, ...redeemParams);
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(id, 0, 0, 0, 4);
    });

    it("_redeemCollateralFromTrove if newDebt != GAS_COMPENSATION and canceled", async () => {
      const coll = parseEther("800");
      const debt = parseEther("300").add(gasCompensation);
      const NICR = computeCR(coll, debt);
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      await collToken.setReturnedCollateralAmount(coll);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);
      const openParams = [
        id,
        coll,
        debt,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);

      const price = parseEther("0.456");
      const maxDebtAmount = parseEther("100");
      const debtLot = min(maxDebtAmount, debt.sub(gasCompensation));
      const newDebt = debt.sub(debtLot);
      expect(newDebt).to.be.not.equal(gasCompensation);

      const result = await troveManager.callStatic.redeemCollateralFromTrove(sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, 0);
      expect(result.cancelledPartial).to.be.true;

      const redeemParams = [
        sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, 0
      ]
      const tx = await run(troveManager.connect(await findAffordableUser()).redeemCollateralFromTrove, ...redeemParams);
      await expect(tx).to.not.emit(troveManager, "TroveUpdated");
    });

    it("_redeemCollateralFromTrove if newDebt != GAS_COMPENSATION and not canceled", async () => {
      const coll = parseEther("800");
      const debt = parseEther("300").add(gasCompensation);
      const NICR = computeCR(coll, debt);
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      await collToken.setReturnedCollateralAmount(coll);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);

      const openParams = [
        id,
        coll,
        debt,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);
      const price = parseEther("0.456");
      const maxDebtAmount = parseEther("100");
      const debtLot = min(maxDebtAmount, debt.sub(gasCompensation));
      const collLot = debtLot.mul(_1E18).div(price);
      const newDebt = debt.sub(debtLot);
      const newColl = coll.sub(collLot);
      expect(newDebt).to.be.not.equal(gasCompensation);
      const minNetDebt = parseEther("150");
      await borrowerOperations.setMinNetDebt(minNetDebt);
      const newStake = await troveManager.computeNewStake(newColl)

      const result = await troveManager.callStatic.redeemCollateralFromTrove(sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, 0);
      expect(result.cancelledPartial).to.be.true;
      const redeemParams = [
        sortedTroves.address, id, maxDebtAmount, price, ZERO_ADDRESS, ZERO_ADDRESS, parseEther("263.9558429027")
      ];
      const tx = await run(troveManager.connect(await findAffordableUser()).redeemCollateralFromTrove, ...redeemParams);
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(id, newDebt, newColl, newStake, 4);
    });

    it("redeemCollateral with valid", async () => {
      const params = await initParameters();
      let price = await troveManager.callStatic.fetchPrice();
      const coll = parseEther("11");
      const debt = parseEther("100").add(gasCompensation);
      const NICR = computeCR(coll, debt);
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      await collToken.setReturnedCollateralAmount(coll);
      const maxSystemDebt = parseEther("10000");
      await troveManager.setMaxSystemDebt(maxSystemDebt);
      const TCR = parseEther("1.7");
      await borrowerOperations.setTCR(TCR);
      const priceRecord = {
        scaledPrice: price,
        timestamp: await time.latest(),
        lastUpdated: await time.latest(),
        roundId: 1
      };
      await priceFeed.storePrice(ZERO_ADDRESS, priceRecord.scaledPrice, await time.latest(), priceRecord.roundId);

      let openParams = [
        id,
        coll,
        debt,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        false,
        { value: ethAmount }]
      const sender = await findAffordableUser();
      await run(borrowerOperations.connect(sender).openTrove, ...openParams);

      //
      const redeemDebt = parseEther("7");
      const maxFeePercent = parseEther("0.15");

      expect(await troveManager.isValidFirstRedemptionHint(sortedTroves.address, id, price, params.MCR)).to.be.true;

      await time.increase(15 * DAY);

      price = await troveManager.callStatic.fetchPrice();
      const pendingRewards = await borrowerOperations.callStatic.applyPendingRewards(id);
      const debtLot = min(redeemDebt, pendingRewards.debt.sub(gasCompensation));
      const collLot = debtLot.mul(_1E18).div(price);

      const senderBeforeBalance = await debtToken.balanceOf(await sender.getAddress());
      await troveManager.connect(sender).redeemCollateral(
        redeemDebt,
        id,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        parseEther("9.726259233303"),
        0,
        maxFeePercent
      );
      const senderAfterBalance = await debtToken.balanceOf(await sender.getAddress());
      expect(senderAfterBalance.sub(senderBeforeBalance)).to.be.equal(redeemDebt.mul(-1));
    });

    it("Should revert if redeemCollateral argument invalid", async () => {
      const params = await initParameters();
      const coll = parseEther("400");
      await collToken.setReturnedCollateralAmount(coll);
      let scaledPrice = ethers.utils.parseEther("2");
      let startTimestamp = await priceFeed.timestamp();
      await priceFeed.storePrice(
        ZERO_ADDRESS,
        scaledPrice,
        startTimestamp,
        1
      );

      await expect(troveManager.redeemCollateral(0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor))
        .to.be.revertedWith("BOOTSTRAP_PERIOD");

      const nextTime = BigNumber.from(await now()).add(15 * DAY);
      await time.setNextBlockTimestamp(nextTime);

      await expect(troveManager.redeemCollateral(0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor.sub(1)))
        .to.be.revertedWith("Max fee 0.5% to 100%");
      await expect(troveManager.redeemCollateral(0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.maxRedemptionFee.add(1)))
        .to.be.revertedWith("Max fee 0.5% to 100%");
      await borrowerOperations.setTCR(params.MCR.sub(1));
      await expect(troveManager.redeemCollateral(0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor))
        .to.be.revertedWith("Cannot redeem when TCR < MCR");
      await borrowerOperations.setTCR(params.MCR);
      await expect(troveManager.redeemCollateral(0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor))
        .to.be.revertedWith("Amount must be greater than zero");
      const account = await owner.getAddress();
      const balance = await debtToken.balanceOf(account);
      await expect(troveManager.redeemCollateral(balance.add(1), ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor))
        .to.be.revertedWith("Insufficient balance");
      await expect(troveManager.redeemCollateral(balance, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, params.redemptionFeeFloor))
        .to.be.revertedWith("Unable to redeem any amount");
    });

    it("updateTroveFromAdjustment debt increase/decrease", async () => {
      const params = await initParameters();
      const coll = parseEther("400");
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      const debt = parseEther("30");
      const NICR = computeCR(coll, debt);
      await collToken.setReturnedCollateralAmount(coll);
      let scaledPrice = ethers.utils.parseEther("2");
      let startTimestamp = await priceFeed.timestamp();
      await priceFeed.storePrice(
        ZERO_ADDRESS,
        scaledPrice,
        startTimestamp,
        1
      );
      await borrowerOperations.setTCR(params.MCR);
      const openParams = [
        id,
        coll,
        debt,
        NICR,
        id,
        id,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);

      const debtIncrease = parseEther("10");
      const borrowFee = parseEther("0.5");
      const newStake = coll.add(0);

      const adjustParams = [
        false,
        true,
        debtIncrease,
        debtIncrease.add(borrowFee),
        false,
        ZERO,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      const tx = await run(borrowerOperations.connect(await findAffordableUser()).updateTroveFromAdjustment, ...adjustParams);
      await expect(tx).to.emit(troveManager, "TotalStakesUpdated").withArgs(newStake);
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(await owner.getAddress(), debt.add(debtIncrease).add(borrowFee), coll, newStake, 2);

      const debtDecrease = parseEther("10");
      const adjustParams2 = [
        false,
        false,
        debtDecrease,
        debtDecrease,
        false,
        ZERO,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      const tx2 = await run(borrowerOperations.connect(await findAffordableUser()).updateTroveFromAdjustment, ...adjustParams2);
      await expect(tx2).to.emit(troveManager, "TotalStakesUpdated")
        .withArgs(newStake)
      await expect(tx2).to.emit(troveManager, "TroveUpdated")
        .withArgs(await owner.getAddress(), debt.add(debtIncrease).add(borrowFee).sub(debtDecrease), coll, newStake, 2);
    });

    it("updateTroveFromAdjustment coll increase/decrease", async () => {
      const params = await initParameters();
      const coll = parseEther("400");
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      const debt = parseEther("30");
      const NICR = computeCR(coll, debt);
      await collToken.setReturnedCollateralAmount(coll);
      let scaledPrice = ethers.utils.parseEther("2");
      let startTimestamp = await priceFeed.timestamp();
      await priceFeed.storePrice(
        ZERO_ADDRESS,
        scaledPrice,
        startTimestamp,
        1
      );
      await borrowerOperations.setTCR(params.MCR);
      // balance not enough. use another account
      const openParams = [
        id,
        coll,
        debt,
        NICR,
        id,
        id,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.connect(await findAffordableUser()).openTrove, ...openParams);

      const collIncrease = parseEther("2");
      const newStake = coll.add(collIncrease);
      const adjustParams = [
        false,
        true,
        ZERO,
        ZERO,
        true,
        collIncrease,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      const tx = await run(borrowerOperations.connect(await findAffordableUser()).updateTroveFromAdjustment, ...adjustParams);
      await expect(tx).to.emit(troveManager, "TotalStakesUpdated")
        .withArgs(coll.add(collIncrease));
      await expect(tx).to.emit(troveManager, "TroveUpdated")
        .withArgs(await owner.getAddress(), debt, coll.add(collIncrease), newStake, 2);

      const collDecrease = parseEther("1.1");
      const newStake2 = coll.add(collIncrease).sub(collDecrease);
      const adjustParams2 = [
        false,
        true,
        ZERO,
        ZERO,
        false,
        collDecrease,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      const tx2 = await run(borrowerOperations.connect(await findAffordableUser()).updateTroveFromAdjustment, ...adjustParams2);
      await expect(tx2).to.emit(troveManager, "TotalStakesUpdated")
        .withArgs(coll.add(collIncrease).sub(collDecrease));
      await expect(tx2).to.emit(troveManager, "TroveUpdated")
        .withArgs(await owner.getAddress(), debt, coll.add(collIncrease).sub(collDecrease), newStake2, 2);
    });

    it("closeTroveByLiquidation", async () => {
      const params = await initParameters();
      const coll = parseEther("400");
      const ethAmount = await borrowerOperations.getETHAmount(coll);
      const debt = parseEther("30");
      const NICR = computeCR(coll, debt);
      await collToken.setReturnedCollateralAmount(coll);
      let scaledPrice = ethers.utils.parseEther("2");
      let startTimestamp = await priceFeed.timestamp();
      await priceFeed.storePrice(
        ZERO_ADDRESS,
        scaledPrice,
        startTimestamp,
        1
      );
      await borrowerOperations.setTCR(params.MCR);
      // balance not enough. use another account
      const openParams = [
        id,
        coll,
        debt,
        NICR,
        id,
        id,
        false,
        { value: ethAmount }
      ];
      await run(borrowerOperations.openTrove, ...openParams);
      const debtIncrease = parseEther("1000");
      const borrowFee = parseEther("0.5");
      await time.increase(DAY);

      const adjustParams = [
        false,
        true,
        debtIncrease,
        debtIncrease.add(borrowFee),
        false,
        ZERO,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      await run(borrowerOperations.updateTroveFromAdjustment, ...adjustParams);
      await time.increase(DAY);

      const adjustParams2 = [
        false,
        true,
        debtIncrease,
        debtIncrease.add(borrowFee),
        false,
        ZERO,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        await owner.getAddress(),
        await owner.getAddress()
      ];
      await run(borrowerOperations.updateTroveFromAdjustment, ...adjustParams2);

      await expect(troveManager.connect(user7).closeTroveByLiquidation(await owner.getAddress())).to.be.revertedWith("Not Liquidation Manager");

      const closeParam = [id];
      const tx = await run(troveManager.closeTroveByLiquidation, ...closeParam);
      await expect(tx).to.emit(troveManager, "TroveUpdated").withArgs(await owner.getAddress(), 0, 0, 0, 3);
    });

    it("claimCollateral", async () => {
      const claimableColl = parseEther("3");
      await collToken.mint(troveManager.address, claimableColl);
      const receiver = await user1.getAddress();
      await troveManager.setSurplusBalances(receiver, claimableColl);

      await expect(troveManager.claimCollateral(receiver)).to.be.revertedWith("No collateral available to claim");

      await troveManager.setSurplusBalances(await owner.getAddress(), claimableColl);
      const beforeBalance = await collToken.balanceOf(receiver);
      await troveManager.claimCollateral(receiver);
      const afterBalance = await collToken.balanceOf(receiver);
      expect(afterBalance.sub(beforeBalance)).to.be.equal(claimableColl);
    });

    it("_applyPendingRewards", async () => {
      const params = await initParameters();
      const trove = {
        debt: parseEther("300"),
        coll: parseEther("4000"),
        stake: parseEther("350"),
        status: 1,
        arrayIndex: 0,
        activeInterestIndex: parseEther("40")
      };
      const account = await owner.getAddress();
      await addTrove(troveManager, account, trove);
      await troveManager.increaseDebt(account, parseEther("250"), parseEther("200"));
      await expect(troveManager.increaseDebt(account, parseEther("1000000"), parseEther("200"))).to.be.revertedWith("Collateral debt limit reached");

      const nextTime = BigNumber.from(await now()).add(2 * DAY);
      const interestInfo = await calculateInterestIndex(troveManager, await troveManager.lastActiveIndexUpdate(), params.interestRate, nextTime);
      const currentInterestIndex = interestInfo.currentInterestIndex;
      let debt = trove.debt;
      expect(trove.activeInterestIndex.lt(currentInterestIndex)).to.be.true;
      debt = debt.mul(currentInterestIndex).div(trove.activeInterestIndex);
      trove.activeInterestIndex = currentInterestIndex;
      const L_coll = parseEther("100");
      const L_debt = parseEther("20");
      await troveManager.setLValues(L_coll, L_debt);
      const rewardSnapshot = {
        collateral: parseEther("0.001"),
        debt: parseEther("0.0001")
      };
      await troveManager.setRewardSnapshots(account, rewardSnapshot.collateral, rewardSnapshot.debt);
      const pendingRewards = getPendingCollAndDebtRewards(trove.stake, rewardSnapshot, L_coll, L_debt);
      trove.coll = trove.coll.add(pendingRewards.pendingColl);
      debt = debt.add(pendingRewards.pendingDebt);
      await troveManager.setDefaultedCollAndDebt(pendingRewards.pendingColl, pendingRewards.pendingDebt);

      await time.increase(DAY);
      const dayInfo = getWeekAndDay(nextTime.sub(await listaCore.startTime()));
      const volumeData = { amount: parseEther("15000").div(VOLUME_MULTIPLIER), week: dayInfo.week, day: dayInfo.day.sub(1) };
      const totalMints = parseEther("10000");
      await troveManager.updateMintVolume(account, totalMints);
      await troveManager.setAccountLatestMint(account, volumeData.amount, volumeData.week, volumeData.day);
      const dailyReward = parseEther("100").div(VOLUME_MULTIPLIER);
      await troveManager.setDailyMintReward(volumeData.week, dailyReward);
      const mintReward = dailyReward.mul(volumeData.amount).div(totalMints.div(VOLUME_MULTIPLIER));
      const assignIds = [0, 2];
      await vault.notifyRegisteredId(assignIds);

      // check
      await time.increaseTo(nextTime);
      const result = await borrowerOperations.callStatic.applyPendingRewards(account);
      expect(result.coll).to.be.equal(trove.coll);
      expect(result.debt).to.be.equal(debt);
      const tx = await borrowerOperations.applyPendingRewards(account);
      await expect(tx).to.emit(troveManager, "TroveSnapshotsUpdated").withArgs(L_coll, L_debt);

      expect(await troveManager.getPendingMintReward(account)).to.be.equal(mintReward);
      await expect(troveManager.innerClaimReward(account)).to.be.revertedWith("Rewards not active");
      expect(await troveManager.claimableReward(account)).to.be.equal(mintReward);

      await time.increase(WEEK);
      assignIds[0] = 1;
      await vault.notifyRegisteredId(assignIds);
      await troveManager.setPeriodFinish(BigNumber.from(await now()).add(WEEK));
      expect(await troveManager.callStatic.innerClaimReward(account)).to.be.equal(1);
      expect(await vault.callStatic.vaultClaimReward(account, ZERO_ADDRESS)).to.be.equal(mintReward);

      volumeData.amount = parseEther("1").div(VOLUME_MULTIPLIER);
      await troveManager.setAccountLatestMint(account, volumeData.amount, volumeData.week, volumeData.day);

      await expect(troveManager.claimReward(account)).to.emit(troveManager, "RewardClaimed").withArgs(account, account, 0);
    });

    it("addCollateralSurplus", async () => {
      const amount = parseEther("3");
      const borrower = await owner.getAddress();

      const beforeValue = await troveManager.surplusBalances(borrower);
      await troveManager.addCollateralSurplus(borrower, amount);
      const afterValue = await troveManager.surplusBalances(borrower);

      expect(afterValue.sub(beforeValue)).to.be.equal(amount);
    });

    it("_redistributeDebtAndColl", async () => {
      const totalStakes = parseEther("1000");
      const coll = parseEther("44");
      const debt = parseEther("33");
      const L_coll = parseEther("111");
      const L_debt = parseEther("55");
      await troveManager.setTotalStakes(totalStakes);
      await troveManager.setLValues(L_coll, L_debt);
      const totalActiveDebt = parseEther("3000");
      const totalActiveColl = parseEther("9000");
      await troveManager.setTotalActiveDebt(totalActiveDebt);
      await troveManager.setTotalActiveColl(totalActiveColl);

      const collRewardPerStake = coll.mul(_1E18).div(totalStakes);
      const debtRewardPerStake = debt.mul(_1E18).div(totalStakes);
      const new_L_coll = L_coll.add(collRewardPerStake);
      const new_L_debt = L_debt.add(debtRewardPerStake);
      const L_coll_error = coll.mul(_1E18).mod(totalStakes);
      const L_debt_error = debt.mul(_1E18).mod(totalStakes);

      // 1. redistribute
      await expect(troveManager.redistributeDebtAndColl(0, coll)).to.not.emit(troveManager, "LTermsUpdated");
      const tx = await troveManager.redistributeDebtAndColl(debt, coll);

      await expect(tx).to.emit(troveManager, "LTermsUpdated").withArgs(new_L_coll, new_L_debt);
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(totalActiveDebt.sub(debt));
      expect(await internalTotalActiveCollateral(troveManager)).to.be.equal(totalActiveColl.sub(coll));
      expect(await troveManager.defaultedDebt()).to.be.equal(debt);
      expect(await troveManager.defaultedCollateral()).to.be.equal(coll);
      expect(await troveManager.lastDebtError_Redistribution()).to.be.equal(L_debt_error);
      expect(await troveManager.lastCollateralError_Redistribution()).to.be.equal(L_coll_error);

      // 2. liquidation
      const liquidator = await user1.getAddress();
      const collSurplus = coll;
      const gasComp = parseEther("5");
      const debtGasComp = debt.add(gasComp);
      const collGasComp = coll.add(gasComp);
      await debtToken.mint(gasPool.address, parseEther("40"));
      await collToken.mint(troveManager.address, collGasComp);

      const newTotalActiveColl = totalActiveColl.sub(coll);
      const newTotalActiveDebt = totalActiveDebt.sub(debt);
      const newDefaultedColl = coll;

      const beforeDebtBalance = await debtToken.balanceOf(gasPool.address);
      const liquidatorBeforeDebtBalance = await debtToken.balanceOf(liquidator);
      const tx2 = await troveManager.finalizeLiquidation(
        liquidator,
        debt,
        coll,
        collSurplus,
        debtGasComp,
        collGasComp
      );
      const afterDebtBalance = await debtToken.balanceOf(gasPool.address);
      const liquidatorAfterDebtBalance = await debtToken.balanceOf(liquidator);
      const _activeColl = newTotalActiveColl.sub(coll).sub(collSurplus);
      const newDefaultedColl2 = newDefaultedColl.add(coll);
      const newTotalActiveColl2 = _activeColl.sub(collGasComp);
      const newTotalActiveDebt2 = newTotalActiveDebt.sub(debt);
      expect(await internalTotalActiveCollateral(troveManager)).to.be.equal(newTotalActiveColl2);
      await expect(tx2).to.emit(troveManager, "SystemSnapshotsUpdated").withArgs(totalStakes, _activeColl.sub(collGasComp).add(newDefaultedColl2));
      await expect(tx2).to.emit(troveManager, "CollateralSent").withArgs(liquidator, collGasComp);
      expect(beforeDebtBalance.sub(afterDebtBalance)).to.be.equal(debtGasComp);
      expect(liquidatorAfterDebtBalance.sub(liquidatorBeforeDebtBalance)).to.be.equal(debtGasComp);

      // 3. movePendingTroveRewardsToActiveBalances
      const debt3 = parseEther("3");
      const coll3 = parseEther("4");
      const defaultedColl = await troveManager.defaultedCollateral();
      const defaultedDebt = await troveManager.defaultedDebt();

      await expect(troveManager.connect(user1).movePendingTroveRewardsToActiveBalances(debt3, coll3)).to.be.revertedWith("Not Liquidation Manager");
      await troveManager.movePendingTroveRewardsToActiveBalances(debt3, coll3);

      expect(await troveManager.defaultedDebt()).to.be.equal(defaultedDebt.sub(debt3));
      expect(await troveManager.defaultedCollateral()).to.be.equal(defaultedColl.sub(coll3));
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(newTotalActiveDebt2.add(debt3));
      expect(await internalTotalActiveCollateral(troveManager)).to.be.equal(newTotalActiveColl2.add(coll3));

      // 4. decreaseDebtAndSendCollateral
      const debtDecrease = parseEther("3");
      const collValue = parseEther("4");
      const account = await user1.getAddress();
      await debtToken.mint(account, parseEther("100"));
      await collToken.mint(troveManager.address, parseEther("100"));

      const beforeBalance = await debtToken.balanceOf(account);
      const beforeCollBalance = await collToken.balanceOf(account);
      const beforeCollBalanceOfTM = await collToken.balanceOf(troveManager.address);
      await troveManager.decreaseDebtAndSendCollateral(account, debtDecrease, collValue);
      const afterBalance = await debtToken.balanceOf(account);
      const afterCollBalance = await collToken.balanceOf(account);
      const afterCollBalanceOfTM = await collToken.balanceOf(troveManager.address);

      expect(beforeBalance.sub(afterBalance)).to.be.equal(debtDecrease);
      expect(afterCollBalance.sub(beforeCollBalance)).to.be.equal(collValue);
      expect(beforeCollBalanceOfTM.sub(afterCollBalanceOfTM)).to.be.equal(collValue);
    });

    it("updateBalances", async () => {
      const nextTime = BigNumber.from(await now()).add(2 * DAY);
      const periodFinish = nextTime.add(2 * HOUR);
      expect(nextTime).to.be.lt(periodFinish);
      await troveManager.setPeriodFinish(periodFinish);
      const lastUpdate = BigNumber.from(await now()).sub(DAY);
      await troveManager.setLastUpdate(lastUpdate);
      const rewardRate = parseEther("0.0023");
      await troveManager.setRewardRate(rewardRate);
      const duration = nextTime.sub(lastUpdate);
      const totalDebt = parseEther("333");
      const totalColl = parseEther("500");
      await troveManager.setDefaultedCollAndDebt(totalColl, totalDebt);
      await troveManager.movePendingTroveRewardsToActiveBalance(totalDebt, totalColl);
      const interestRate = parseEther("0.077");
      await troveManager.setInterestRate(interestRate);

      const integral = duration.mul(rewardRate).mul(_1E18).div(totalDebt);
      const interestIndexInfo = await accrueActiveInterests(troveManager, await troveManager.lastActiveIndexUpdate(), interestRate, nextTime);

      // check
      await time.setNextBlockTimestamp(nextTime);
      await troveManager.updateBalances();
      expect(await troveManager.rewardIntegral()).to.be.equal(integral);
      expect(await internalTotalActiveDebt(troveManager)).to.be.equal(totalDebt.mul(INTEREST_PRECISION.add(interestIndexInfo.interestFactor)).div(INTEREST_PRECISION));
      expect(await troveManager.interestPayable()).to.be.equal(totalDebt.mul(interestIndexInfo.interestFactor).div(INTEREST_PRECISION));
      expect(await troveManager.activeInterestIndex()).to.be.equal(interestIndexInfo.currentInterestIndex);
      expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(nextTime);
    });
  })
})
