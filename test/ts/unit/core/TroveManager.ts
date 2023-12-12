import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import {
  InternalTroveManager,
  ListaMathHelper,
  MockAggregator,
  MockBorrowerOperations,
  MockDebtToken,
  MockInternalPriceFeed,
  MockListaCore,
  SortedTroves,
} from "../../../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";
import { expect } from "chai";
import { _1E18, abi, DAY, HOUR, min, WEEK, YEAR, ZERO, ZERO_ADDRESS } from "../../utils";

describe("TroveManager", () => {
  let gasPool: Contract;
  let priceFeed: MockInternalPriceFeed;
  let listaCore: MockListaCore;
  let listaMath: ListaMathHelper;
  let debtToken: MockDebtToken;
  let collToken: MockDebtToken;
  let borrowerOperations: MockBorrowerOperations;
  let troveManager: InternalTroveManager;
  let sortedTroves: SortedTroves;

  const gasCompensation = parseEther("20");
  const INTEREST_PRECISION = BigNumber.from("10").pow(27);
  const SUNSETTING_INTEREST_RATE = INTEREST_PRECISION.mul(5000).div(YEAR * 10000);
  const BETA = 2;
  const VOLUME_MULTIPLIER = BigNumber.from("10").pow(20);
  const CCR = BigNumber.from("1500000000000000000");
  const MAX_INTEREST_RATE_IN_BPS = 400;

  let owner: Signer;
  let user1: Signer;
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();

    gasPool = await ethers.deployContract("GasPool", []) as Contract;
    await gasPool.deployed();

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    await listaCore.setOwner(await owner.getAddress());
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

    priceFeed = await ethers.deployContract("MockInternalPriceFeed", [listaCore.address, ethFeed.address]) as MockInternalPriceFeed;
    await priceFeed.deployed();
    let scaledPrice = ethers.utils.parseEther("2");
    let startTimestamp = await priceFeed.timestamp();
    await priceFeed.storePrice(
      ZERO_ADDRESS,
      scaledPrice,
      startTimestamp,
      2
    );

    sortedTroves = await ethers.deployContract("SortedTroves", []) as SortedTroves;
    await sortedTroves.deployed();

    let factory = await ethers.getContractFactory("InternalTroveManager");
    troveManager = await factory.deploy(
      listaCore.address,
      gasPool.address,
      debtToken.address,
      borrowerOperations.address,
      await owner.getAddress(),
      await owner.getAddress(),
      gasCompensation
    ) as InternalTroveManager;
    await troveManager.deployed();
    await troveManager.setAddresses(priceFeed.address, sortedTroves.address, collToken.address);
    await sortedTroves.setAddresses(troveManager.address);
    await borrowerOperations.setAddresses(troveManager.address, collToken.address, debtToken.address);
  })

  const now = async () => {
    return BigNumber.from(await time.latest());
  }

  const getWeekAndDay = (duration: BigNumber) => {
    return {
      week: duration.div(WEEK),
      day: duration.mod(WEEK).div(DAY)
    };
  }

  describe("Deployment", () => {
    it("Deploy", async () => {
      expect(await troveManager.debtToken()).to.be.equal(debtToken.address);
      expect(await troveManager.borrowerOperationsAddress()).to.be.equal(borrowerOperations.address);
      expect(await troveManager.vault()).to.be.equal(await owner.getAddress());
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

    it("setPaused", async () => {
      await troveManager.setPaused(true);
      expect(await troveManager.paused()).to.be.true;

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
      expect(await troveManager.callStatic.fetchPrice()).to.be.equal(await borrowerOperations.getETHAmount(price));
    });

    it("notifyRegisteredId", async () => {
      const assignIds = [1, 2];

      await expect(troveManager.connect(user1).notifyRegisteredId(assignIds)).to.be.reverted;
      await expect(troveManager.notifyRegisteredId([1, 2, 3])).to.be.revertedWith("Incorrect ID count");

      await troveManager.notifyRegisteredId(assignIds);
      expect(await troveManager.periodFinish()).to.be.equal((await now()).div(WEEK).mul(WEEK).add(WEEK));

      const emissionId = await troveManager.emissionId();
      expect(emissionId.debt).to.be.equal(assignIds[0]);
      expect(emissionId.minting).to.be.equal(assignIds[1]);

      await expect(troveManager.notifyRegisteredId(assignIds)).to.be.revertedWith("Already assigned");
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
      await troveManager.setLastActiveIndexUpdate(currentTime.sub(DAY));
      await troveManager.setInterestRate(interestRate);
      await troveManager.setActiveInterestIndex(parseEther("14"));

      const calcInterestResult = await calculateInterestIndex(currentTime.sub(DAY), interestRate, await now());
      const result = await troveManager.calculateInterestIndex();

      expect(result.currentInterestIndex).to.be.equal(calcInterestResult.currentInterestIndex);
      expect(result.interestFactor).to.be.equal(calcInterestResult.interestFactor);
    });

    const internalTotalActiveDebt = async () => {
      const data = await ethers.provider.getStorageAt(troveManager.address, 26);
      return BigNumber.from(abi.decode(["uint256"], data)[0]);
    }
    const internalTotalActiveCollateral = async () => {
      const data = await ethers.provider.getStorageAt(troveManager.address, 25);
      return BigNumber.from(abi.decode(["uint256"], data)[0]);
    }
    const calculateInterestIndex = async (lastIndexUpdateTime: BigNumber, interestRate: BigNumber, nowTimestamp: BigNumber) => {
      const result = { currentInterestIndex: ZERO, interestFactor: ZERO };
      if (lastIndexUpdateTime.eq(nowTimestamp)) {
        result.currentInterestIndex = await troveManager.activeInterestIndex();
        return result;
      }

      result.currentInterestIndex = await troveManager.activeInterestIndex();
      if (interestRate.gt(0)) {
        const deltaTime = nowTimestamp.sub(lastIndexUpdateTime);
        result.interestFactor = deltaTime.mul(interestRate);
        result.currentInterestIndex = result.currentInterestIndex.mul(INTEREST_PRECISION.add(result.interestFactor)).div(INTEREST_PRECISION);
      }

      return result;
    }
    const accrueActiveInterests = async (lastIndexUpdateTime: BigNumber, interestRate: BigNumber, nowTimestamp: BigNumber) => {
      let {
        currentInterestIndex,
        interestFactor
      } = await calculateInterestIndex(lastIndexUpdateTime, interestRate, nowTimestamp);

      let interest = ZERO;
      let totalDebt = await internalTotalActiveDebt();
      if (interestFactor.gt(0)) {
        interest = totalDebt.mul(interestFactor).div(INTEREST_PRECISION);
      }
      let result = {
        currentInterestIndex,
        interestFactor,
        totalActiveDebt: totalDebt.add(interest),
        interestPayable: interest.add(await troveManager.interestPayable()),
        activeInterestIndex: currentInterestIndex,
        lastActiveIndexUpdate: await now(),
      };
      return result;
    }

    it("_accrueActiveInterests", async () => {
      // prepare
      let currentTime = await now();
      const interestRate = parseEther("1.33");
      const lastIndexUpdateTime = currentTime.sub(DAY);
      await troveManager.setLastActiveIndexUpdate(lastIndexUpdateTime);
      await troveManager.setActiveInterestIndex(parseEther("14"));
      await troveManager.setInterestRate(interestRate);
      await troveManager.setTotalActiveDebt(parseEther("100"));
      await troveManager.setInterestPayable(parseEther("1"));
      const nextTime = (await now()).add(DAY);

      await time.setNextBlockTimestamp(nextTime);
      const data = await accrueActiveInterests(lastIndexUpdateTime, interestRate, nextTime);
      await troveManager.accrueActiveInterests();

      expect(data.interestFactor).to.be.gt(0);
      expect(await troveManager.activeInterestIndex()).to.be.equal(data.activeInterestIndex);
      expect(await internalTotalActiveDebt()).to.be.equal(data.totalActiveDebt);
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

    const calcDecayedBaseRate = async (nowTime: BigNumber, lastTime: BigNumber, baseRate: BigNumber, minuteDecayFactor: BigNumber) => {
      const elapsedMinutes = nowTime.sub(lastTime).div(60);
      const factor = await listaMath._decPow(minuteDecayFactor, elapsedMinutes);
      return baseRate.mul(factor).div(_1E18);
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

      const lastFeeUpdateTime = await now();
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

      const lastFeeUpdateTime = await now();
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
      const newNow = (await now()).add(duration);
      await time.increaseTo(newNow);

      const result = getWeekAndDay(duration);
      const data = await troveManager.getWeekAndDay();
      expect(data[0]).to.be.equal(result.week);
      expect(data[1]).to.be.equal(result.day);
    });

    const getPendingCollAndDebtRewards = (stake: BigNumber, snapshot: {
      collateral: BigNumber,
      debt: BigNumber
    }, L_coll: BigNumber, L_debt: BigNumber): {
      pendingColl: BigNumber,
      pendingDebt: BigNumber
    } => {
      const deltaColl = L_coll.sub(snapshot.collateral);
      const deltaDebt = L_debt.sub(snapshot.debt);
      if (deltaColl.add(deltaDebt).eq(0)) {
        return {
          pendingColl: ZERO,
          pendingDebt: ZERO
        };
      }

      return {
        pendingColl: stake.mul(deltaColl).div(_1E18),
        pendingDebt: stake.mul(deltaDebt).div(_1E18),
      };
    }

    it("getPendingCollAndDebtRewards and getEntireDebtAndColl and getEntireSystemDebt and getTroveCollAndDebt", async () => {
      const L_coll = parseEther("100");
      const L_debt = parseEther("20");
      await troveManager.setLValues(L_coll, L_debt);
      const snapshot = {
        collateral: parseEther("10"),
        debt: parseEther("4"),
      }
      await troveManager.setRewardSnapshots(await owner.getAddress(), snapshot.collateral, snapshot.debt);
      const stake = parseEther("2");
      const interestIndex = parseEther("0.32");
      await troveManager.setTrove(await owner.getAddress(), snapshot.collateral, snapshot.debt, stake, 1, interestIndex);
      const lastActiveIndexUpdateTime = await now();
      await troveManager.setLastActiveIndexUpdate(lastActiveIndexUpdateTime);
      const activeInterestIndex = parseEther("0.3");
      await troveManager.setActiveInterestIndex(activeInterestIndex);
      const interestRate = parseEther("0.55");
      await troveManager.setInterestRate(interestRate);

      await time.increaseTo((await now()).add(2 * DAY));

      // getPendingCollAndDebtRewards
      const result = getPendingCollAndDebtRewards(stake, snapshot, L_coll, L_debt);
      let indexInfo = await calculateInterestIndex(lastActiveIndexUpdateTime, interestRate, await now());
      const data = await troveManager.getPendingCollAndDebtRewards(await owner.getAddress());
      expect(data[0]).to.be.equal(result.pendingColl);
      expect(data[1]).to.be.equal(result.pendingDebt);

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
      indexInfo = await calculateInterestIndex(lastActiveIndexUpdateTime, interestRate, await now());
      expect(await troveManager.getEntireSystemDebt()).to.be.equal(totalActiveDebt.add(totalActiveDebt.mul(indexInfo.interestFactor).div(INTEREST_PRECISION)));
    });

    it("_updateBaseRateFromRedemption", async () => {
      const lastFeeUpdateTime = await now();
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
      const days = getWeekAndDay((await now()).sub(startTime));
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
      const days2 = getWeekAndDay((await now()).sub(startTime));
      await troveManager.updateMintVolume(await owner.getAddress(), debtAmount);

      const totalMints2 = await troveManager.getTotalMints(days2.week);
      expect(totalMints2[days2.day.toNumber()]).to.be.equal(totalMints[days.day.toNumber()] + amount.toNumber());
      const userLatestMints2 = await troveManager.accountLatestMint(await owner.getAddress());
      expect(userLatestMints2.amount).to.be.equal(amount.mul(2));
      expect(userLatestMints2.week).to.be.equal(days2.week);
      expect(userLatestMints2.day).to.be.equal(days2.day);

      // 3rd, another week
      await time.increase(1.5 * WEEK);
      const days3 = getWeekAndDay((await now()).sub(startTime));
      await troveManager.updateMintVolume(await owner.getAddress(), debtAmount);

      const totalMints3 = await troveManager.getTotalMints(days3.week);
      expect(totalMints3[days3.day.toNumber()]).to.be.equal(amount);
      const userLatestMints3 = await troveManager.accountLatestMint(await owner.getAddress());
      expect(userLatestMints3.amount).to.be.equal(amount);
      expect(userLatestMints3.week).to.be.equal(days3.week);
      expect(userLatestMints3.day).to.be.equal(days3.day);
    });

    const computeCR = (coll: BigNumber, debt: BigNumber, price: BigNumber | null = null) => {
      if (price == null) {
        price = BigNumber.from(1);
      }

      if (debt.gt(0)) {
        return coll.mul(price).div(debt);
      }
      return BigNumber.from(2).pow(256).sub(1);
    }
    const computeStake = (coll: BigNumber, totalCollSnapshot: BigNumber, totalStakeSnapshot: BigNumber) => {
      if (totalStakeSnapshot.eq(0)) {
        return coll;
      }
      return coll.mul(totalStakeSnapshot).div(totalCollSnapshot);
    }
    describe("use", () => {
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
        const tx = await borrowerOperations.openTrove(
          borrower1,
          coll,
          debt,
          NICR,
          borrower1,
          borrower1,
          false,
          { value: ethAmount }
        );
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
        const tx2 = await borrowerOperations.openTrove(
          borrower2,
          coll2,
          debt2,
          NICR2,
          borrower2,
          borrower2,
          true,
          { value: coll2 }
        );


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
        expect(entireBalances[0]).to.be.equal(coll.add(coll2));
        expect(entireBalances[1]).to.be.equal(debt.add(debt2));
        expect(entireBalances[2]).to.be.equal(await troveManager.callStatic.fetchPrice());

        const interestInfo = await calculateInterestIndex(
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
        await borrowerOperations.openTrove(
          account,
          coll,
          debt,
          NICR,
          account,
          account,
          false
        );

        const tx = await borrowerOperations.closeTrove(
          account,
          account,
          coll,
          debt
        );
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
        expect(await internalTotalActiveDebt()).to.be.equal(0);
        await expect(tx).to.emit(troveManager, "TroveUpdated")
          .withArgs(account, 0, 0, 0, 1);
      });

      it("redeemCollateral", async () => {
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

        await borrowerOperations.openTrove(
          await owner.getAddress(),
          coll,
          debt,
          NICR,
          await owner.getAddress(),
          await owner.getAddress(),
          false,
          { value: ethAmount }
        );

        const nextTime = (await now()).add(15 * DAY);
        await time.setNextBlockTimestamp(nextTime);

        const price = await borrowerOperations.getETHAmount(await priceFeed.callStatic.fetchPrice(ZERO_ADDRESS));

        const trove = await troveManager.Troves(await owner.getAddress());
        const interestIndexInfo = await accrueActiveInterests(await troveManager.lastActiveIndexUpdate(), await troveManager.interestRate(), nextTime);
        expect(trove.activeInterestIndex).to.be.lt(interestIndexInfo.currentInterestIndex);
        const newDebt = debt.mul(interestIndexInfo.currentInterestIndex).div(trove.activeInterestIndex);

        const debtLot = min(debt, newDebt.sub(gasCompensation));
        const collateralLot = debtLot.mul(_1E18).div(price);
        const interestIndex = await calculateInterestIndex(await troveManager.lastActiveIndexUpdate(), await troveManager.interestRate(), nextTime);
        const entireDebtWithInterest = (await internalTotalActiveDebt()).mul(interestIndex.interestFactor.add(INTEREST_PRECISION)).div(INTEREST_PRECISION);
        const redeemDebtFraction = collateralLot.mul(price).div(entireDebtWithInterest);
        const newBaseRate = (await calcDecayedBaseRate(nextTime, await troveManager.lastFeeOperationTime(), await troveManager.baseRate(), await troveManager.minuteDecayFactor())).add(redeemDebtFraction.div(BETA));
        const collFee = await troveManager.calcRedemptionFee(await troveManager.calcRedemptionRate(newBaseRate), collateralLot);

        const tx = await troveManager.redeemCollateral(
          debt,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          NICR,
          0,
          parseEther("0.3")
        );

        await expect(tx).to.emit(troveManager, "TroveUpdated").withArgs(await owner.getAddress(), 0, 0, 0, 4);
        await expect(tx).to.emit(troveManager, "Redemption").withArgs(debt, debtLot, collateralLot, collFee);
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

        const nextTime = (await now()).add(15 * DAY);
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
        await borrowerOperations.openTrove(
          await owner.getAddress(),
          coll,
          debt,
          NICR,
          await owner.getAddress(),
          await owner.getAddress(),
          false,
          { value: ethAmount }
        );

        const debtIncrease = parseEther("10");
        const borrowFee = parseEther("0.5");
        const newStake = coll.add(0);
        const tx = await borrowerOperations.updateTroveFromAdjustment(
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
        );
        await expect(tx).to.emit(troveManager, "TotalStakesUpdated").withArgs(newStake);
        await expect(tx).to.emit(troveManager, "TroveUpdated")
          .withArgs(await owner.getAddress(), debt.add(debtIncrease).add(borrowFee), coll, newStake, 2);

        const debtDecrease = parseEther("10");
        const tx2 = await borrowerOperations.updateTroveFromAdjustment(
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
        );
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
        await borrowerOperations.connect(user1).openTrove(
          await owner.getAddress(),
          coll,
          debt,
          NICR,
          await owner.getAddress(),
          await owner.getAddress(),
          false,
          { value: ethAmount }
        );

        const collIncrease = parseEther("2");
        const newStake = coll.add(collIncrease);
        const tx = await borrowerOperations.connect(user1).updateTroveFromAdjustment(
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
        );
        await expect(tx).to.emit(troveManager, "TotalStakesUpdated")
          .withArgs(coll.add(collIncrease));
        await expect(tx).to.emit(troveManager, "TroveUpdated")
          .withArgs(await owner.getAddress(), debt, coll.add(collIncrease), newStake, 2);

        const collDecrease = parseEther("1.1");
        const newStake2 = coll.add(collIncrease).sub(collDecrease);
        const tx2 = await borrowerOperations.updateTroveFromAdjustment(
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
        );
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
        await borrowerOperations.connect(user1).openTrove(
          await owner.getAddress(),
          coll,
          debt,
          NICR,
          await owner.getAddress(),
          await owner.getAddress(),
          false,
          { value: ethAmount }
        );
        const debtIncrease = parseEther("1000");
        const borrowFee = parseEther("0.5");
        await time.increase(DAY);
        await borrowerOperations.updateTroveFromAdjustment(
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
        );
        await time.increase(DAY);
        await borrowerOperations.updateTroveFromAdjustment(
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
        );

        await expect(troveManager.connect(user1).closeTroveByLiquidation(await owner.getAddress())).to.be.revertedWith("Not Liquidation Manager");
        const tx = await troveManager.closeTroveByLiquidation(await owner.getAddress());
        await expect(tx).to.emit(troveManager, "TroveUpdated").withArgs(await owner.getAddress(), 0, 0, 0, 3);
      });

      it("claimCollateral", async () => {
        const claimableColl = parseEther("3");
        collToken.mint(troveManager.address, claimableColl);
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
        await troveManager.setTrove(account, trove.coll, trove.debt, trove.stake, trove.status, trove.activeInterestIndex);
        await troveManager.increaseDebt(account, parseEther("250"), parseEther("200"));
        await expect(troveManager.increaseDebt(account, parseEther("1000000"), parseEther("200"))).to.be.revertedWith("Collateral debt limit reached");

        const nextTime = (await now()).add(2 * DAY);
        const interestInfo = await calculateInterestIndex(await troveManager.lastActiveIndexUpdate(), params.interestRate, nextTime);
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
        const pendingRewards = await getPendingCollAndDebtRewards(trove.stake, rewardSnapshot, L_coll, L_debt);
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
        await troveManager.notifyRegisteredId(assignIds);

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
        await troveManager.notifyRegisteredId(assignIds);
        await troveManager.setPeriodFinish((await now()).add(WEEK));
        expect(await troveManager.callStatic.innerClaimReward(account)).to.be.equal(1);
        expect(await troveManager.callStatic.vaultClaimReward(account, ZERO_ADDRESS)).to.be.equal(mintReward);

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
        expect(await internalTotalActiveDebt()).to.be.equal(totalActiveDebt.sub(debt));
        expect(await internalTotalActiveCollateral()).to.be.equal(totalActiveColl.sub(coll));
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
        expect(await internalTotalActiveCollateral()).to.be.equal(newTotalActiveColl2);
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
        expect(await internalTotalActiveDebt()).to.be.equal(newTotalActiveDebt2.add(debt3));
        expect(await internalTotalActiveCollateral()).to.be.equal(newTotalActiveColl2.add(coll3));

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
        const nextTime = (await now()).add(2 * DAY);
        const periodFinish = nextTime.add(2 * HOUR);
        expect(nextTime).to.be.lt(periodFinish);
        await troveManager.setPeriodFinish(periodFinish);
        const lastUpdate = (await now()).sub(DAY);
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
        const interestIndexInfo = await accrueActiveInterests(await troveManager.lastActiveIndexUpdate(), interestRate, nextTime);

        // check
        await time.setNextBlockTimestamp(nextTime);
        await troveManager.updateBalances();
        expect(await troveManager.rewardIntegral()).to.be.equal(integral);
        expect(await internalTotalActiveDebt()).to.be.equal(totalDebt.mul(INTEREST_PRECISION.add(interestIndexInfo.interestFactor)).div(INTEREST_PRECISION));
        expect(await troveManager.interestPayable()).to.be.equal(totalDebt.mul(interestIndexInfo.interestFactor).div(INTEREST_PRECISION));
        expect(await troveManager.activeInterestIndex()).to.be.equal(interestIndexInfo.currentInterestIndex);
        expect(await troveManager.lastActiveIndexUpdate()).to.be.equal(nextTime);
      });
    })
  })
})
