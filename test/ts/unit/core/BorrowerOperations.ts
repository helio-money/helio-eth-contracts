import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer } from "ethers";
import { MockBorrowerOperations, MockDebtToken, MockListaCore, MockTroveManager } from "../../../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ZERO, ZERO_ADDRESS, _1E18 } from "../../utils";

const parseEther = ethers.utils.parseEther;

describe("BorrowerOperations", () => {
  const factory = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";
  const minNetDebt = BigNumber.from("1100000000000000100");
  const gasCompensation = parseEther("2");
  const CCR = parseEther("1.5");
  const ONE = _1E18;
  const PRECISION = ONE;

  let listaCore: MockListaCore;
  let debtToken: MockDebtToken;
  let erc20Token: MockDebtToken;
  let troveManager: MockTroveManager;
  let borrowerOperations: MockBorrowerOperations;
  let wBETH: string;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let referral: string;
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    referral = await user2.getAddress();

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    await listaCore.setOwner(await owner.getAddress());
    const startTime = await time.latest();
    await listaCore.setStartTime(startTime);

    debtToken = await ethers.deployContract("MockDebtToken", ["debt", "DEBT"]) as MockDebtToken;
    await debtToken.deployed();

    erc20Token = await ethers.deployContract("MockDebtToken", ["coll", "COLL"]) as MockDebtToken;
    await erc20Token.deployed();
    wBETH = erc20Token.address;

    troveManager = await ethers.deployContract("MockTroveManager", []) as MockTroveManager;
    await troveManager.deployed();

    borrowerOperations = await ethers.deployContract("MockBorrowerOperations", [
      listaCore.address,
      wBETH,
      referral,
      debtToken.address,
      factory,
      minNetDebt,
      gasCompensation
    ]) as MockBorrowerOperations;
    await borrowerOperations.deployed();
  })

  const computeCR = (coll: BigNumber, debt: BigNumber, price: BigNumber | null = null) => {
    if (price == null) {
      price = BigNumber.from(1);
    }

    if (debt.gt(0)) {
      return coll.mul(price).div(debt);
    }
    return BigNumber.from(2).pow(256).sub(1);
  }

  const setEntireSystemBalances = async (coll: BigNumber, debt: BigNumber, price: BigNumber) => {
    await borrowerOperations.setFactory(await owner.getAddress());
    await borrowerOperations.configureCollateral(troveManager.address, erc20Token.address)
    await borrowerOperations.setFactory(factory);

    await troveManager.setEntireSystemColl(coll);
    await troveManager.setEntireSystemDebt(debt);
    await troveManager.setPrice(price);
  }

  const getTCRData = (coll: BigNumber, debt: BigNumber, price: BigNumber) => {
    return {
      tcr: coll.mul(price).div(debt),
      totalPricedCollateral: coll.mul(price),
      totalDebt: debt,
    };
  }

  const getCollateralAndTCRData = (coll: BigNumber, debt: BigNumber, price: BigNumber) => {
    let data = getTCRData(coll, debt, price);
    return {
      price,
      totalPricedCollateral: data.totalPricedCollateral,
      totalDebt: debt,
      isRecoveryMode: isRecoveryMode(data.tcr),
    };
  }

  const isRecoveryMode = (tcr: BigNumber) => {
    return tcr.lt(CCR);
  }

  const isValidAdjustmentInCurrentMode = (
    totalPricedColl: BigNumber, totalDebt: BigNumber, isRecoveryMode: boolean, collWithdraw: BigNumber,
    isCollIncrease: boolean, isDebtIncrease: boolean,
    coll: BigNumber, debt: BigNumber, price: BigNumber, collChange: BigNumber, debtChange: BigNumber, MCR: BigNumber) => {
    let oldICR = computeCR(coll, debt, price);
    let newICR = computeCR(
      isCollIncrease ? coll.add(collChange) : coll.sub(collChange),
      isDebtIncrease ? debt.add(debtChange) : debt.sub(debtChange),
      price
    );
    if (isRecoveryMode) {
      expect(collWithdraw).to.be.equal(0);
      if (isDebtIncrease) {
        return newICR.gte(CCR) && newICR.gte(oldICR);
      }
    } else {
      let newTCR = computeCR(
        isCollIncrease ? totalPricedColl.add(collChange.mul(price)) : totalPricedColl.sub(collChange.mul(price)),
        isDebtIncrease ? totalDebt.add(debtChange) : totalDebt.sub(debtChange),
      );
      return newICR.gte(MCR) && newTCR.gte(CCR);
    }
    return true;
  }

  describe("Deployment", () => {
    it("deploy", async () => {
      expect(await borrowerOperations.LISTA_CORE()).to.be.equal(listaCore.address);
      expect(await borrowerOperations.DEBT_GAS_COMPENSATION()).to.be.equal(gasCompensation);
      expect(await borrowerOperations.wBETH()).to.be.equal(wBETH);
      expect(await borrowerOperations.factory()).to.be.equal(factory);
      expect(await borrowerOperations.referral()).to.be.equal(referral);
      expect(await borrowerOperations.debtToken()).to.be.equal(debtToken.address);
      expect(await borrowerOperations.minNetDebt()).to.be.equal(minNetDebt);
    });
  })

  describe("Functions", () => {
    it("configureCollateral", async () => {
      // check require
      await expect(borrowerOperations.configureCollateral(troveManager.address, erc20Token.address)).to.be.revertedWith("!factory");

      await borrowerOperations.setFactory(await owner.getAddress());
      await expect(borrowerOperations.configureCollateral(troveManager.address, debtToken.address)).to.be.revertedWith("Not wBETH collteral");

      const tx = await borrowerOperations.configureCollateral(troveManager.address, wBETH);

      expect(await borrowerOperations.getTroveManagersLength()).to.be.equal(1);
      await expect(tx).to.emit(borrowerOperations, "CollateralConfigured").withArgs(troveManager.address, wBETH);
      const data = await borrowerOperations.troveManagersData(troveManager.address);
      expect(data.collateralToken).to.be.equal(wBETH);
      expect(data.index).to.be.equal(0);
    });

    it("removeTroveManager", async () => {
      await expect(borrowerOperations.removeTroveManager(troveManager.address)).to.be.revertedWith("Trove Manager cannot be removed");

      await troveManager.setSunsetting(true);
      await troveManager.setEntireSystemDebt(0);
      await borrowerOperations.setFactory(await owner.getAddress());
      await borrowerOperations.configureCollateral(troveManager.address, wBETH);

      const tx = await borrowerOperations.removeTroveManager(troveManager.address);

      await expect(tx).to.emit(borrowerOperations, "TroveManagerRemoved").withArgs(troveManager.address);
      expect(await borrowerOperations.getTroveManagersLength()).to.be.equal(0);
    });

    it("fetchBalances", async () => {
      await borrowerOperations.setFactory(await owner.getAddress());
      const totalColl = ethers.utils.parseEther("999");
      const totalDebt = ethers.utils.parseEther("111");
      const price = ethers.utils.parseEther("7");
      await troveManager.setEntireSystemColl(totalColl);
      await troveManager.setEntireSystemDebt(totalDebt);
      await troveManager.setPrice(price);
      await borrowerOperations.configureCollateral(troveManager.address, wBETH);

      expect(await borrowerOperations.getTroveManagersLength()).to.be.equal(1);
      const balanceList = await borrowerOperations.callStatic.fetchBalances();
      expect(balanceList.collaterals[0]).to.be.equal(totalColl);
      expect(balanceList.debts[0]).to.be.equal(totalDebt);
      expect(balanceList.prices[0]).to.be.equal(price);
    });

    it("checkRecoveryMode", async () => {
      const CCR = await borrowerOperations.CCR();
      // 1. < CCR
      expect(await borrowerOperations.checkRecoveryMode(CCR.sub(1))).to.be.true;
      // 2. == CCR
      expect(await borrowerOperations.checkRecoveryMode(CCR)).to.be.false;
      // 3. > CCR
      expect(await borrowerOperations.checkRecoveryMode(CCR.add(1))).to.be.false;
    });

    it("getCompositeDebt", async () => {
      const debt = ONE.mul(2);
      expect(await borrowerOperations.getCompositeDebt(debt)).to.be.equal(debt.add(gasCompensation));
    });

    it("_getCollateralAmount", async () => {
      const rate = ONE.mul(3);
      const amount = ONE.mul(7);
      await erc20Token.setExchangeRate(rate);

      expect(await borrowerOperations.getCollateralAmount(amount)).to.be.equal(amount.mul(PRECISION).div(rate));
    });

    it("getETHAmount", async () => {
      const rate = ONE.mul(3);
      const amount = ONE.mul(7);
      await erc20Token.setExchangeRate(rate);

      const collAmount = await borrowerOperations.getCollateralAmount(amount);
      expect(await borrowerOperations.getETHAmount(collAmount)).to.be.equal(collAmount.mul(rate).div(PRECISION));
    });

    it("_getCollChange", async () => {
      // 1. receive has value
      const received1 = ONE;
      const withdraw1 = 0;
      const change1 = await borrowerOperations.getCollChange(received1, withdraw1);
      expect(change1.collChange).to.be.equal(received1);
      expect(change1.isCollIncrease).to.be.true;

      // 2. both have values
      const received2 = ONE;
      const withdraw2 = ONE.mul(2);
      const change2 = await borrowerOperations.getCollChange(received2, withdraw2);
      expect(change2.collChange).to.be.equal(received2);
      expect(change2.isCollIncrease).to.be.true;

      // 3. both are 0s
      const received3 = 0;
      const withdraw3 = 0;
      const change3 = await borrowerOperations.getCollChange(received3, withdraw3);
      expect(change3.collChange).to.be.equal(0);
      expect(change3.isCollIncrease).to.be.false;

      // 4. receive is 0
      const received4 = 0;
      const withdraw4 = ONE;
      const change4 = await borrowerOperations.getCollChange(received4, withdraw4);
      expect(change4.collChange).to.be.equal(withdraw4);
      expect(change4.isCollIncrease).to.be.false;
    });

    it("_requireICRisAboveMCR", async () => {
      await expect(borrowerOperations.requireICRisAboveMCR(1, 0)).to.be.not.reverted;
      await expect(borrowerOperations.requireICRisAboveMCR(1, 1)).to.be.not.reverted;
      await expect(borrowerOperations.requireICRisAboveMCR(1, 2)).to.be.revertedWith("BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    });

    it("_requireICRisAboveCCR", async () => {
      await expect(borrowerOperations.requireICRisAboveCCR(CCR.sub(1))).to.be.revertedWith("BorrowerOps: Operation must leave trove with ICR >= CCR");
      await expect(borrowerOperations.requireICRisAboveCCR(CCR)).to.be.not.reverted;
      await expect(borrowerOperations.requireICRisAboveCCR(CCR.add(1))).to.be.not.reverted;
    });

    it("_requireNewICRisAboveOldICR", async () => {
      await expect(borrowerOperations.requireNewICRisAboveOldICR(1, 0)).to.be.not.reverted;
      await expect(borrowerOperations.requireNewICRisAboveOldICR(1, 1)).to.be.not.reverted;
      await expect(borrowerOperations.requireNewICRisAboveOldICR(1, 2)).to.be.revertedWith("BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode")
    });

    it("_requireNewTCRisAboveCCR", async () => {
      await expect(borrowerOperations.requireNewTCRisAboveCCR(CCR.sub(1))).to.be.revertedWith("BorrowerOps: An operation that would result in TCR < CCR is not permitted");
      await expect(borrowerOperations.requireNewTCRisAboveCCR(CCR)).to.be.not.reverted;
      await expect(borrowerOperations.requireNewTCRisAboveCCR(CCR.add(1))).to.be.not.reverted;
    });

    it("_requireAtLeastMinNetDebt", async () => {
      await expect(borrowerOperations.requireAtLeastMinNetDebt(minNetDebt.sub(1))).to.be.revertedWith("BorrowerOps: Trove's net debt must be greater than minimum");
      await expect(borrowerOperations.requireAtLeastMinNetDebt(minNetDebt)).to.be.not.reverted;
      await expect(borrowerOperations.requireAtLeastMinNetDebt(minNetDebt.add(1))).to.be.not.reverted;
    });

    it("_requireValidMaxFeePercentage", async () => {
      await expect(borrowerOperations.requireValidMaxFeePercentage(PRECISION.sub(1))).to.be.not.reverted;
      await expect(borrowerOperations.requireValidMaxFeePercentage(PRECISION)).to.be.not.reverted;
      await expect(borrowerOperations.requireValidMaxFeePercentage(PRECISION.add(1))).to.be.revertedWith("Max fee percentage must less than or equal to 100%");
    });

    it("_getNewTroveAmounts and _getNewICRFromTroveChange", async () => {
      let coll = ONE.mul(10);
      let debt = ONE.mul(5);
      let deltaColl = ONE.mul(7);
      let deltaDebt = ONE.mul(4);
      let isCollIncrease = true;
      let isDebtIncrease = true;
      const price = ONE.mul(3);

      // 1. coll increase
      let result = await borrowerOperations.getNewTroveAmounts(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease);
      expect(result[0]).to.be.equal(coll.add(deltaColl));
      expect(await borrowerOperations.getNewICRFromTroveChange(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease, price))
        .to.be.equal(computeCR(coll.add(deltaColl), debt.add(deltaDebt), price));

      // 2. coll decrease
      isCollIncrease = false;
      result = await borrowerOperations.getNewTroveAmounts(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease);
      expect(result[0]).to.be.equal(coll.sub(deltaColl));
      expect(await borrowerOperations.getNewICRFromTroveChange(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease, price))
        .to.be.equal(computeCR(coll.sub(deltaColl), debt.add(deltaDebt), price));

      // 3. debt increase
      isCollIncrease = true;
      result = await borrowerOperations.getNewTroveAmounts(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease);
      expect(result[1]).to.be.equal(debt.add(deltaDebt));
      expect(await borrowerOperations.getNewICRFromTroveChange(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease, price))
        .to.be.equal(computeCR(coll.add(deltaColl), debt.add(deltaDebt), price));

      // 4. debt decrease
      isDebtIncrease = false;
      result = await borrowerOperations.getNewTroveAmounts(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease);
      expect(result[1]).to.be.equal(debt.sub(deltaDebt));
      expect(await borrowerOperations.getNewICRFromTroveChange(coll, debt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease, price))
        .to.be.equal(computeCR(coll.add(deltaColl), debt.sub(deltaDebt), price));
    });

    it("_getNewTCRFromTroveChange", async () => {
      let totalColl = ONE.mul(10);
      let totalDebt = ONE.mul(5);
      let deltaColl = ONE.mul(7);
      let deltaDebt = ONE.mul(4);
      let isCollIncrease = true;
      let isDebtIncrease = true;

      // 1. coll increase
      expect(await borrowerOperations.getNewTCRFromTroveChange(totalColl, totalDebt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease))
        .to.be.equal(computeCR(totalColl.add(deltaColl), totalDebt.add(deltaDebt)));

      // 2. coll decrease
      isCollIncrease = false;
      expect(await borrowerOperations.getNewTCRFromTroveChange(totalColl, totalDebt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease))
        .to.be.equal(computeCR(totalColl.sub(deltaColl), totalDebt.add(deltaDebt)));

      // 3. debt increase
      isCollIncrease = true;
      expect(await borrowerOperations.getNewTCRFromTroveChange(totalColl, totalDebt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease))
        .to.be.equal(computeCR(totalColl.add(deltaColl), totalDebt.add(deltaDebt)));

      // 4. debt decrease
      isDebtIncrease = false;
      expect(await borrowerOperations.getNewTCRFromTroveChange(totalColl, totalDebt, deltaColl, isCollIncrease, deltaDebt, isDebtIncrease))
        .to.be.equal(computeCR(totalColl.add(deltaColl), totalDebt.sub(deltaDebt)));
    });

    it("_getTCRData", async () => {
      const balances = {
        collaterals: [4, 5, 6],
        debts: [1, 2, 3],
        prices: [7, 8, 9]
      };

      const result = await borrowerOperations.getTCRData(balances);
      let sumColl = BigNumber.from(0);
      for (let i = 0; i < balances.collaterals.length; i++) {
        sumColl = BigNumber.from(balances.collaterals[i]).mul(balances.prices[i]).add(sumColl);
      }
      const sumDebt = BigNumber.from(balances.debts.reduce((acc, e) => acc + e));
      expect(result.amount).to.be.equal(computeCR(sumColl, sumDebt));
      expect(result.totalPricedCollateral).to.be.equal(sumColl);
      expect(result.totalDebt).to.be.equal(sumDebt);
    });

    it("_getCollateralAndTCRData", async () => {
      await expect(borrowerOperations.getCollateralAndTCRData(troveManager.address)).to.be.revertedWith("Collateral not enabled");

      await borrowerOperations.setFactory(await owner.getAddress());
      await borrowerOperations.configureCollateral(troveManager.address, erc20Token.address)
      const totalColl = parseEther("234");
      const totalDebt = parseEther("5000");
      const price = BigNumber.from("300000000");
      await troveManager.setEntireSystemColl(totalColl);
      await troveManager.setEntireSystemDebt(totalDebt);
      await troveManager.setPrice(price);
      const pricedColl = totalColl.mul(price);
      const tcr = computeCR(pricedColl, totalDebt);
      const isRecoveryMode = tcr.lt(CCR);

      const result = await borrowerOperations.callStatic.getCollateralAndTCRData(troveManager.address);
      expect(result.collateralToken).to.be.equal(erc20Token.address);
      expect(result.price).to.be.equal(price);
      expect(result.totalPricedCollateral).to.be.equal(pricedColl);
      expect(result.totalDebt).to.be.equal(totalDebt);
      expect(result.isRecoveryMode).to.be.equal(isRecoveryMode);
    });

    it("getGlobalSystemBalances", async () => {
      await borrowerOperations.setFactory(await owner.getAddress());
      await borrowerOperations.configureCollateral(troveManager.address, erc20Token.address)
      const totalColl = parseEther("234");
      const totalDebt = parseEther("5000");
      const price = BigNumber.from("300000000");
      await troveManager.setEntireSystemColl(totalColl);
      await troveManager.setEntireSystemDebt(totalDebt);
      await troveManager.setPrice(price);
      const pricedColl = totalColl.mul(price);

      const result = await borrowerOperations.callStatic.getGlobalSystemBalances();
      expect(result.totalPricedCollateral).to.be.equal(pricedColl);
      expect(result.totalDebt).to.be.equal(totalDebt);
    });

    it("setMinNetDebt", async () => {
      await expect(borrowerOperations.setMinNetDebt(0)).to.be.reverted;

      await borrowerOperations.setMinNetDebt(1);
      expect(await borrowerOperations.minNetDebt()).to.be.equal(1);
    });

    it("getTCR", async () => {
      const coll = parseEther("200");
      const debt = parseEther("33");
      const price = BigNumber.from("30000000");
      await setEntireSystemBalances(coll, debt, price);
      const tcr = computeCR(coll, debt, price);

      expect(await borrowerOperations.callStatic.getTCR()).to.be.equal(tcr);
    });

    it("_requireValidAdjustmentInCurrentMode", async () => {
      // 1. normal mode
      const isDebtIncrease = true;
      const normalMode = false;
      const vars = {
        price: BigNumber.from("776666666"),
        totalPricedCollateral: 0,
        totalDebt: 0,
        collChange: parseEther("44"),
        netDebtChange: parseEther("30"),
        isCollIncrease: true,
        debt: parseEther("30"),
        coll: parseEther("500"),
        newDebt: 0,
        newColl: 0,
        stake: 0,
        debtChange: BigNumber.from("0"),
        account: ethers.constants.AddressZero,
        MCR: BigNumber.from("8000000000"),
      };

      await expect(borrowerOperations.requireValidAdjustmentInCurrentMode(
        0,
        0,
        true,
        1,
        isDebtIncrease,
        vars
      )).to.be.revertedWith("BorrowerOps: Collateral withdrawal not permitted Recovery Mode");

      // 1.1 < MCR
      await expect(borrowerOperations.requireValidAdjustmentInCurrentMode(
        0,
        0,
        normalMode,
        0,
        isDebtIncrease,
        vars
      )).to.be.revertedWith("BorrowerOps: An operation that would result in ICR < MCR is not permitted");

      // 1.2 < CCR
      vars.MCR = BigNumber.from("7000000000");
      await expect(borrowerOperations.requireValidAdjustmentInCurrentMode(
        parseEther("700").mul(vars.price),
        parseEther("44"),
        normalMode,
        0,
        isDebtIncrease,
        vars
      )).to.be.revertedWith("BorrowerOps: An operation that would result in TCR < CCR is not permitted");

      // 2. recovery mode
      const recoveryMode = true;
      // 2.1 < CCR
      await expect(borrowerOperations.requireValidAdjustmentInCurrentMode(
        0,
        0,
        recoveryMode,
        0,
        isDebtIncrease,
        vars
      )).to.be.revertedWith("BorrowerOps: Operation must leave trove with ICR >= CCR");

      // 2.2 < oldICR
      vars.debt = BigNumber.from("30000");
      vars.debtChange = BigNumber.from("555");
      vars.netDebtChange = BigNumber.from("44");
      vars.coll = BigNumber.from("10922208889665231742244707749230460");
      await expect(borrowerOperations.requireValidAdjustmentInCurrentMode(
        0,
        0,
        recoveryMode,
        0,
        isDebtIncrease,
        vars
      )).to.be.revertedWith("BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode");
    });

    it("_requireValidwBETHAmount", async () => {
      // prepare
      const rate = BigNumber.from("16000000");
      const ethAmount = ONE.mul(3);
      await erc20Token.setExchangeRate(rate);
      const collAmount = await borrowerOperations.getCollateralAmount(ethAmount);
      await erc20Token.setReturnedCollateralAmount(collAmount);

      // 1. == collateralAmount
      expect(await erc20Token.balanceOf(borrowerOperations.address)).to.be.gte(0);
      await borrowerOperations.requireValidwBETHAmount(ethAmount, 0, { value: ethAmount });
      expect(await erc20Token.balanceOf(referral)).to.be.equal(0);

      // 2. < collateralAmount
      expect(await erc20Token.balanceOf(borrowerOperations.address)).to.be.lt(1);
      const tx = await borrowerOperations.requireValidwBETHAmount(ethAmount, 1, { value: ethAmount });
      expect(await erc20Token.balanceOf(borrowerOperations.address)).to.be.equal(collAmount);
      expect(await ethers.provider.getBalance(erc20Token.address)).to.be.equal(ethAmount);
      await expect(tx).to.emit(erc20Token, "DepositEth").withArgs(borrowerOperations.address, ethAmount, collAmount, referral);
    });

    it("_requireUserAcceptsFee", async () => {
      const fee = BigNumber.from("44");
      const amount = BigNumber.from("77");

      // 1. <= maxFeePercent
      await expect(borrowerOperations.requireUserAcceptsFee(fee, amount, parseEther("0.6"))).to.be.not.reverted;

      // 2. > maxFeePercent
      await expect(borrowerOperations.requireUserAcceptsFee(fee, amount, parseEther("0.5"))).to.be.revertedWith("Fee exceeded provided maximum");
    });

    it("_triggerBorrowingFee", async () => {
      // const fee = BigNumber.from("44");
      const debtAmount = BigNumber.from("77");
      const maxFeePercent = parseEther("0.6")
      const fee = debtAmount.mul(maxFeePercent).div(PRECISION);
      await troveManager.setFeeRate(maxFeePercent);
      const feeReceiver = await user1.getAddress();
      await listaCore.setFeeReceiver(feeReceiver);
      const caller = await owner.getAddress();

      const beforeBalance = await debtToken.balanceOf(feeReceiver);
      const tx = await borrowerOperations.triggerBorrowingFee(
        troveManager.address,
        erc20Token.address,
        caller,
        maxFeePercent,
        debtAmount
      );
      const afterBalance = await debtToken.balanceOf(feeReceiver);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(fee);
      await expect(tx).to.emit(borrowerOperations, "BorrowingFeePaid")
        .withArgs(caller, erc20Token.address, fee);
    });

    it("withdrawCollInETH", async () => {
      await borrowerOperations.setFactory(await owner.getAddress());
      await borrowerOperations.configureCollateral(troveManager.address, erc20Token.address);
      const receiver = await user1.getAddress();
      const ethAmount = ONE.mul(3);
      expect(await ethers.provider.getBalance(borrowerOperations.address)).to.be.equal(0);
      await borrowerOperations.transferETH({ value: ethAmount });

      expect(await ethers.provider.getBalance(borrowerOperations.address)).to.be.equal(ethAmount);
      const beforeBalance = await ethers.provider.getBalance(receiver);
      await troveManager.withdrawCollInETHHelper(borrowerOperations.address, receiver, ethAmount);
      expect(await ethers.provider.getBalance(borrowerOperations.address)).to.be.equal(0);
      const afterBalance = await ethers.provider.getBalance(receiver);
      expect(afterBalance.sub(beforeBalance)).to.be.equal(ethAmount);
    });

    it("rebalance", async () => {
      const ethAmount = ONE.mul(3);
      await borrowerOperations.transferETH({ value: ethAmount.mul(2) });
      const rate = BigNumber.from("1234567");
      await erc20Token.setExchangeRate(rate);
      const collAmount = ethAmount.mul(await borrowerOperations.WBETH_EXCHANGE_RATE_UNIT()).div(rate);

      expect(await ethers.provider.getBalance(borrowerOperations.address)).to.be.gte(ethAmount);
      const beforeBalance = await ethers.provider.getBalance(borrowerOperations.address);
      const tx = await borrowerOperations.rebalance(ethAmount);
      const afterBalance = await ethers.provider.getBalance(borrowerOperations.address);

      expect(beforeBalance.sub(afterBalance)).to.be.equal(ethAmount);
      await expect(tx).to.emit(borrowerOperations, "Rebalanced").withArgs(ethAmount, collAmount);
    });

    const getCollAmount = async (rate: BigNumber, ethAmount: BigNumber): Promise<BigNumber> => {
      await erc20Token.setExchangeRate(rate);
      return await borrowerOperations.getCollateralAmount(ethAmount);
    }

    it("openTrove and closeTrove", async () => {
      // require
      await listaCore.setPaused(true);
      await expect(borrowerOperations.openTrove(troveManager.address, await owner.getAddress(), 0, 0, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Deposits are paused");
      await listaCore.setPaused(false);
      await expect(borrowerOperations.openTrove(troveManager.address, await owner.getAddress(), 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, { value: 0 }))
        .to.be.revertedWith("Should send ETH collateral");
      await expect(borrowerOperations.openTrove(troveManager.address, await user1.getAddress(), 0, 0, ZERO_ADDRESS, ZERO_ADDRESS, { value: 0 }))
        .to.be.revertedWith("Delegate not approved");

      // prepare
      const params = await initEnv();

      // calc
      const icr = computeCR(params.collAmount, params.compositeDebt, params.price);
      const newTcr = computeCR(params.totalColl.add(params.collAmount).mul(params.price), params.totalDebt.add(params.compositeDebt));

      // check
      expect(params.recoveryMode).to.be.false;
      expect(params.maxFeePercent).to.be.lt(PRECISION);
      expect(params.debtFee.mul(PRECISION).div(params.debtAmount)).to.be.lte(params.maxFeePercent);
      expect(params.netDebtFee).to.be.gte(minNetDebt);
      expect(icr).to.be.gte(params.MCR);
      expect(newTcr).to.be.gte(CCR);

      // 1. openTrove
      const beforeDebtTokenBalance = await debtToken.balanceOf(await owner.getAddress());
      const tx = await borrowerOperations.openTrove(
        troveManager.address,
        owner.getAddress(),
        params.maxFeePercent,
        params.debtAmount,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: params.ethAmount }
      );
      const afterDebtTokenBalance = await debtToken.balanceOf(await owner.getAddress());
      await expect(tx).to.emit(borrowerOperations, "BorrowingFeePaid")
        .withArgs(await owner.getAddress(), erc20Token.address, params.debtFee);
      expect(await erc20Token.balanceOf(troveManager.address)).to.be.equal(params.collAmount);
      expect(afterDebtTokenBalance.sub(beforeDebtTokenBalance)).to.be.equal(params.debtAmount);

      // 2. closeTrove
      const collReward = params.collAmount.mul(parseEther("0.1333")).div(PRECISION);
      const debtReward = params.debtAmount.mul(parseEther("2.5")).div(PRECISION);
      const newColl = params.collAmount.add(collReward);
      const newDebt = params.debtAmount.add(debtReward);
      await troveManager.setPendingRewards(newColl, newDebt);
      const newTcr2 = computeCR(params.totalColl.sub(newColl).mul(params.price), params.totalDebt.sub(newDebt));
      expect(params.recoveryMode).to.be.false;
      expect(newTcr2).to.be.gte(CCR);

      const beforeDebt = await debtToken.balanceOf(await owner.getAddress());
      await borrowerOperations.closeTrove(troveManager.address, owner.getAddress());
      const afterDebt = await debtToken.balanceOf(await owner.getAddress());
      expect(beforeDebt.sub(afterDebt)).to.be.equal(newDebt.sub(gasCompensation));
    });

    it("addColl", async () => {
      // require
      await listaCore.setPaused(true);
      await expect(borrowerOperations.addColl(troveManager.address, await owner.getAddress(), ZERO_ADDRESS, ZERO_ADDRESS, { value: 0 }))
        .to.be.revertedWith("Trove adjustments are paused");
      await listaCore.setPaused(false);
      await expect(borrowerOperations.addColl(troveManager.address, await owner.getAddress(), ZERO_ADDRESS, ZERO_ADDRESS, { value: 0 }))
        .to.be.revertedWith("Should send ETH collateral");
      await expect(borrowerOperations.addColl(troveManager.address, await user1.getAddress(), ZERO_ADDRESS, ZERO_ADDRESS, { value: 0 }))
        .to.be.revertedWith("Delegate not approved");

      const params = await initEnv();

      await borrowerOperations.openTrove(troveManager.address, await owner.getAddress(), params.maxFeePercent, params.debtAmount, ZERO_ADDRESS, ZERO_ADDRESS, { value: params.ethAmount });
      const increaseAmount = parseEther("0.001");
      const collIncrease = await getCollAmount(params.exchangeRate, increaseAmount);
      await erc20Token.setReturnedCollateralAmount(collIncrease);

      expect(params.recoveryMode).to.be.false;
      expect(isValidAdjustmentInCurrentMode(
        params.totalColl.mul(params.price), params.totalDebt, params.recoveryMode, ZERO, true, false,
        params.newColl, params.newDebt, params.price, collIncrease, ZERO, params.MCR
      )).to.be.true;
      await borrowerOperations.addColl(troveManager.address, await owner.getAddress(), ZERO_ADDRESS, ZERO_ADDRESS, { value: increaseAmount });
    });

    const initEnv = async () => {
      const ethAmount = BigNumber.from("37037010");
      const maxFeePercent = parseEther("0.33");
      const debtAmount = parseEther("2");
      const exchangeRate = BigNumber.from("1234567");
      const collAmount = await getCollAmount(exchangeRate, ethAmount);
      await erc20Token.setReturnedCollateralAmount(collAmount);
      const feeReceiver = await user2.getAddress();
      await listaCore.setFeeReceiver(feeReceiver);
      const MCR = parseEther("1.1");
      await troveManager.setMCR(MCR);
      const totalColl = parseEther("100");
      const totalDebt = parseEther("20");
      const price = parseEther("0.3001");
      await setEntireSystemBalances(totalColl, totalDebt, price);
      const feeRate = parseEther("0.305");
      const debtFee = debtAmount.mul(feeRate).div(PRECISION);
      await troveManager.setFeeRate(feeRate);
      const netDebt = debtAmount.add(debtFee);
      const compositeDebt = netDebt.add(gasCompensation);

      const collReward = collAmount.mul(parseEther("0.1333")).div(PRECISION);
      const debtReward = debtAmount.mul(parseEther("2.5")).div(PRECISION);
      const newColl = collAmount.add(collReward);
      const newDebt = debtAmount.add(debtReward);
      await troveManager.setPendingRewards(newColl, newDebt);

      const trcData = getTCRData(collAmount, debtAmount, price);
      const recoveryMode = isRecoveryMode(trcData.tcr);

      return {
        ethAmount,
        maxFeePercent,
        debtAmount,
        exchangeRate,
        collAmount,
        MCR,
        totalColl,
        totalDebt,
        price,
        debtFee,
        netDebtFee: netDebt,
        compositeDebt,
        collReward,
        debtReward,
        newColl,
        newDebt,
        recoveryMode,
        feeRate,
      };
    }

    it("withdrawColl", async () => {
      const params = await initEnv();
      // const ethAmount = BigNumber.from("37037010");
      // const maxFeePercent = parseEther("0.33");
      // const debtAmount = parseEther("2");
      // const exchangeRate = BigNumber.from("1234567");
      // const collAmount = await getCollAmount(exchangeRate, ethAmount);
      // await erc20Token.setReturnedCollateralAmount(collAmount);
      // const feeReceiver = await user2.getAddress();
      // await listaCore.setFeeReceiver(feeReceiver);
      // const MCR = parseEther("1.1");
      // await troveManager.setMCR(MCR);
      // const totalColl = parseEther("100");
      // const totalDebt = parseEther("20");
      // const price = parseEther("0.3001");
      // await setEntireSystemBalances(totalColl, totalDebt, price);
      // const debtFee = parseEther("0.61");
      // await troveManager.setFee(debtFee);
      // const netDebtFee = debtAmount.add(debtFee);
      // const compositeDebt = netDebtFee.add(gasCompensation);
      //
      // const collReward = collAmount.mul(parseEther("0.1333")).div(PRECISION);
      // const debtReward = debtAmount.mul(parseEther("2.5")).div(PRECISION);
      // const newColl = collAmount.add(collReward);
      // const newDebt = debtAmount.add(debtReward);
      // await troveManager.setPendingRewards(newColl, newDebt);
      //
      // const trcData = getTCRData(collAmount, debtAmount, price);
      // const recoveryMode = isRecoveryMode(trcData.tcr);
      expect(params.recoveryMode).to.be.false;
      await borrowerOperations.openTrove(troveManager.address, await owner.getAddress(), params.maxFeePercent, params.debtAmount, ZERO_ADDRESS, ZERO_ADDRESS, { value: params.ethAmount });
      await expect(borrowerOperations.withdrawColl(troveManager.address, await user1.getAddress(), 0, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Delegate not approved");

      // withdraw data
      const collWithdraw = parseEther("0.02");
      expect(isValidAdjustmentInCurrentMode(params.totalColl.mul(params.price), params.totalDebt, params.recoveryMode, collWithdraw, false, false,
        params.newColl, params.newDebt, params.price, collWithdraw, ZERO, params.MCR)).to.be.true;
      await borrowerOperations.withdrawColl(troveManager.address, await owner.getAddress(), collWithdraw, ZERO_ADDRESS, ZERO_ADDRESS);
    });

    it("withdrawDebt", async () => {
      // require
      await listaCore.setPaused(true);
      await expect(borrowerOperations.withdrawDebt(troveManager.address, await owner.getAddress(), 0, 0, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Withdrawals are paused");
      await listaCore.setPaused(false);
      await expect(borrowerOperations.withdrawDebt(troveManager.address, await user1.getAddress(), 0, 0, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Delegate not approved");

      // prepare
      const params = await initEnv();
      const withdrawDebt = parseEther("0.001");
      const isDebtIncrease = true;

      expect(params.recoveryMode).to.be.false;
      expect(isDebtIncrease).to.be.true;
      expect(isValidAdjustmentInCurrentMode(
        params.totalColl.mul(params.price), params.totalDebt, params.recoveryMode, ZERO, false, isDebtIncrease,
        params.newColl, params.newDebt, params.price, ZERO, withdrawDebt, params.MCR)
      ).to.be.true;

      const tx = await borrowerOperations.withdrawDebt(troveManager.address, await owner.getAddress(), params.maxFeePercent, withdrawDebt, ZERO_ADDRESS, ZERO_ADDRESS);
      await expect(tx).to.emit(borrowerOperations, "BorrowingFeePaid").withArgs(await owner.getAddress(), erc20Token.address, withdrawDebt.mul(params.feeRate).div(PRECISION));
    });

    it("repayDebt", async () => {
      // prepare
      const params = await initEnv();
      const repayDebt = parseEther("1.1");
      const isDebtIncrease = false;

      // check
      await expect(borrowerOperations.repayDebt(troveManager.address, await user1.getAddress(), repayDebt, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Delegate not approved");

      expect(isValidAdjustmentInCurrentMode(
        params.totalColl.mul(params.price), params.totalDebt, params.recoveryMode, ZERO, false, isDebtIncrease,
        params.newColl, params.newDebt, params.price, ZERO, repayDebt, params.MCR)
      ).to.be.true;

      const tx = await borrowerOperations.repayDebt(troveManager.address, await owner.getAddress(), repayDebt, ZERO_ADDRESS, ZERO_ADDRESS);
      await expect(tx).to.not.emit(borrowerOperations, "BorrowingFeePaid");

      const repayDebt2 = parseEther("0.5");
      const tx2 = await borrowerOperations.adjustTrove(troveManager.address, await owner.getAddress(), params.maxFeePercent, ZERO, ZERO, repayDebt2, false, ZERO_ADDRESS, ZERO_ADDRESS);
      await expect(tx2).to.not.emit(borrowerOperations, "BorrowingFeePaid");
    });
  })

  describe("Should revert", () => {
    it("onlyOwner", async () => {
      const versatileAddr = await user2.getAddress();
      const operations = borrowerOperations.connect(user1);

      await expect(operations.setFactory(versatileAddr)).to.be.revertedWith("Only owner");
      await expect(operations.setReferral(versatileAddr)).to.be.revertedWith("Only owner");
      await expect(operations.setDebtToken(versatileAddr)).to.be.revertedWith("Only owner");
      await expect(operations.setMinNetDebt(versatileAddr)).to.be.revertedWith("Only owner");
      await expect(operations.rebalance(versatileAddr)).to.be.revertedWith("Only owner");
    });

    it("require", async () => {
      await erc20Token.setExchangeRate(parseEther("0.34"));

      await expect(borrowerOperations.setMinNetDebt(0)).to.be.reverted;
      await expect(borrowerOperations.rebalance(0)).to.emit(borrowerOperations, "Rebalanced").withArgs(0, 0);

      await borrowerOperations.transferETH({ value: parseEther("1") });
      await expect(borrowerOperations.rebalance(parseEther("2"))).to.be.revertedWith("Not enough ETH");
      await expect(borrowerOperations.rebalance(0)).to.emit(borrowerOperations, "Rebalanced").withArgs(0, 0);

      await expect(borrowerOperations.withdrawCollInETH(await owner.getAddress(), 1))
        .to.be.revertedWith("Not wBETH TroveManager");
    });

    it("adjustTrove", async () => {
      const account = await owner.getAddress();

      // lista paused
      await listaCore.setPaused(true);
      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 0, 0, 0, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Trove adjustments are paused");
      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 0, 1, 0, 0, false, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Trove adjustments are paused");
      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 0, 0, 0, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Trove adjustments are paused");

      // cannot deposit + withdraw in the same time
      await listaCore.setPaused(false);
      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 0, 1, 1, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("BorrowerOperations: Cannot withdraw and add coll");

      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 0, 0, 0, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("BorrowerOps: There must be either a collateral change or a debt change");

      await setEntireSystemBalances(PRECISION, PRECISION, PRECISION);
      await expect(borrowerOperations.adjustTrove(troveManager.address, account, 1, 1, 0, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("BorrowerOps: Debt increase requires non-zero debtChange");
      await expect(borrowerOperations.adjustTrove(troveManager.address, await user1.getAddress(), 1, 1, 0, 0, true, ZERO_ADDRESS, ZERO_ADDRESS))
        .to.be.revertedWith("Delegate not approved");
    });

    it("closeTrove", async () => {
      const account = await owner.getAddress();
      const coll = parseEther("100");
      const debt = BigNumber.from("824000");
      const price = BigNumber.from("12345");
      const tcr = computeCR(coll, debt, price);
      expect(isRecoveryMode(tcr)).to.be.true;
      await setEntireSystemBalances(coll, debt, price);
      await expect(borrowerOperations.closeTrove(troveManager.address, await user1.getAddress())).to.be.revertedWith("Delegate not approved");
      await expect(borrowerOperations.closeTrove(troveManager.address, account)).to.be.revertedWith("BorrowerOps: Operation not permitted during Recovery Mode");
    });
  })

  // TODO
  describe("Recovery Mode", () => {

  })
});
