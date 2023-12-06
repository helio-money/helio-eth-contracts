import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { BoostCalculator, ListaCore, ListaToken, TokenLocker } from "../../../../typechain-types";
import { ETHER, WEEK, ZERO_ADDRESS, _1E18, _1E9, getNthWeek, getWeek, now } from "../../utils";
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("BoostCalculator Contract", () => {
  const INITIAL_LISTA_TOKENS = ETHER.mul(1000);
  const GRACE_WEEKS = 2;
  let startTimestamp: BigNumber;
  let maxBoostGraceWeeks: BigNumber;

  let boostCalculator: BoostCalculator;
  let listaCore: ListaCore;
  let tokenLocker: TokenLocker;
  let listaToken: ListaToken;

  let owner: Signer;
  let guardian: Signer;
  let feeReceiver: Signer;
  let manager: Signer;
  let vault: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let user4: Signer;

  const allUsersLock = async () => {
    // lock tokens
    await tokenLocker.lock(user1.getAddress(), 1, 10); // 10%
    await tokenLocker.lock(user2.getAddress(), 2, 10); // 20%
    await tokenLocker.lock(user3.getAddress(), 3, 10); // 30%
    await tokenLocker.lock(user3.getAddress(), 4, 10); // 40%
  }

  beforeEach(async () => {
    // users
    [owner, guardian, feeReceiver, manager, vault, user1, user2, user3, user4] = await ethers.getSigners();

    // deploy ListaCore
    listaCore = await ethers.deployContract("ListaCore", [
      await owner.getAddress(),
      guardian.getAddress(),
      ZERO_ADDRESS,
      await feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    // deploy TokenLocker
    tokenLocker = await ethers.deployContract("TokenLocker", [
      listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await manager.getAddress(),
      _1E18,
    ]) as TokenLocker;

    // deploy ListaToken
    listaToken = await ethers.deployContract("ListaToken", [
      // ZERO_ADDRESS,
      await vault.getAddress(),
      ZERO_ADDRESS,
      tokenLocker.address,
    ]) as ListaToken;
    await listaToken.deployed();

    // deploy BoostCalculator
    boostCalculator = await ethers.deployContract("BoostCalculator", [
      listaCore.address,
      tokenLocker.address,
      GRACE_WEEKS,
    ]) as BoostCalculator;
    await boostCalculator.deployed();

    // init TokenLocker properties
    await tokenLocker.setLockToken(listaToken.address);

    // set properties
    startTimestamp = await listaCore.startTime();
    maxBoostGraceWeeks = await boostCalculator.MAX_BOOST_GRACE_WEEKS();

    // mint INITIAL_LISTA_TOKENS to each user
    await listaToken.connect(vault).mintToVault(INITIAL_LISTA_TOKENS.mul(10));
    await listaToken.connect(vault).transfer(owner.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(vault).transfer(user1.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(vault).transfer(user2.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(vault).transfer(user3.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(vault).transfer(user4.getAddress(), INITIAL_LISTA_TOKENS);
  });

  describe("constructor(address, address, uint256)", async () => {
    it("Should revert if _graceWeeks is 0.", async () => {
      await expect(ethers.deployContract("BoostCalculator", [
        listaCore.address,
        tokenLocker.address,
        0,
      ]))
        .to.be.revertedWith("Grace weeks cannot be 0");
    });
  });

  describe("getBoostedAmount(address, uint256, uint256, uint256)", async () => {
    it("Return the ammount directly when before the MAX_BOOST_GRACE_WEEKS.", async () => {
      await allUsersLock();

      const oriAmount = 150;
      const oriPreviousAmount = 150;
      const totalWeeklyEmissions = 1500;

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(oriAmount);
    });

    it("Return half of the amount if the pct is 1(0).", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));

      const oriAmount = 100;
      const oriPreviousAmount = 1000;
      const totalWeeklyEmissions = 10000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight)
        .to.be.equal(totalWeight)
        .to.be.equal(0);
      const pct = _1E9.mul(user1Weight).div(1);
      expect(pct).to.be.equal(0);

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(oriAmount / 2);
    });

    it("Return the amount if the maxBoostable is greater than and equal to totalAmount.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriAmount = 100;
      const oriPreviousAmount = 900;
      const totalWeeklyEmissions = 10000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct).to.be.equal(1e8);

      const totalAmount = oriAmount + oriPreviousAmount;
      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      // entire claim receives max boost
      expect(maxBoostable)
        .to.be.greaterThanOrEqual(totalAmount);

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(oriAmount);
    });

    it("Return half of the amount if the maxBoostable is less than and equal to previousAmount.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriAmount = 100;
      const oriPreviousAmount = 1000;
      const totalWeeklyEmissions = 5000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct).to.be.equal(1e8);

      const totalAmount = oriAmount + oriPreviousAmount;
      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      // entire claim receives max boost
      expect(maxBoostable)
        .not.to.be.greaterThanOrEqual(totalAmount);

      const fullDecay = maxBoostable.mul(2);
      // entire claim receives no boost
      expect(fullDecay)
        .to.be.lessThanOrEqual(oriPreviousAmount);

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(oriAmount / 2);
    });

    it("Return when remaining claim is the entire decay amount.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriAmount = 150;
      const oriPreviousAmount = 150;
      const totalWeeklyEmissions = 1500;

      let amount = oriAmount;
      let previousAmount = oriAmount;
      let adjustedAmount = BigNumber.from(0);

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct).to.be.equal(1e8);

      const totalAmount = amount + previousAmount;
      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      // entire claim receives max boost
      expect(maxBoostable)
        .not.to.be.greaterThanOrEqual(totalAmount);

      const fullDecay = maxBoostable.mul(2);
      // entire claim receives no boost
      expect(fullDecay)
        .not.to.be.lessThanOrEqual(previousAmount);

      // apply max boost for partial claim
      expect(previousAmount)
        .not.to.be.lessThan(maxBoostable);

      // apply no boost for partial claim
      expect(totalAmount)
        .not.to.be.greaterThan(fullDecay);

      // simplified calculation if remaining claim is the entire decay amount
      expect(amount)
        .to.be.equal(maxBoostable);

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(adjustedAmount.add(maxBoostable.mul(3).div(4)));
    });

    it("Return when apply max boost for partial claim.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriAmount = 150;
      const oriPreviousAmount = 150;
      const totalWeeklyEmissions = 1600;

      let amount = oriAmount;
      let previousAmount = oriPreviousAmount;
      let adjustedAmount = BigNumber.from(0);

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct).to.be.equal(1e8);

      const totalAmount = amount + previousAmount;
      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      // entire claim receives max boost
      expect(maxBoostable)
        .not.to.be.greaterThanOrEqual(totalAmount);

      const fullDecay = maxBoostable.mul(2);
      // entire claim receives no boost
      expect(fullDecay)
        .not.to.be.lessThanOrEqual(previousAmount);

      // apply max boost for partial claim
      expect(previousAmount)
        .to.be.lessThan(maxBoostable);
      adjustedAmount = maxBoostable.sub(previousAmount);
      amount -= adjustedAmount.toNumber();
      previousAmount = maxBoostable.toNumber();

      // apply no boost for partial claim
      expect(totalAmount)
        .not.to.be.greaterThan(fullDecay);

      // simplified calculation if remaining claim is the entire decay amount
      expect(amount)
        .not.to.be.equal(maxBoostable);

      // get adjusted amount based on the final boost
      const finalBoosted = BigNumber.from(amount).sub(
        BigNumber.from(amount * (previousAmount + amount - maxBoostable.toNumber())).div(maxBoostable).div(2)
      );
      adjustedAmount = adjustedAmount.add(finalBoosted);

      // get adjusted amount based on the initial boost
      const initialBoosted = BigNumber.from(amount).sub(
        BigNumber.from(amount * (previousAmount - maxBoostable.toNumber())).div(maxBoostable).div(2)
      );
      adjustedAmount = adjustedAmount.add(initialBoosted.sub(finalBoosted).div(2));

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(adjustedAmount);
    });

    it("Return when apply no boost for partial claim.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriAmount = 200;
      const oriPreviousAmount = 100;
      const totalWeeklyEmissions = 750;

      let amount = oriAmount;
      let previousAmount = oriPreviousAmount;
      let adjustedAmount = BigNumber.from(0);

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct).to.be.equal(1e8);

      const totalAmount = amount + previousAmount;
      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      // entire claim receives max boost
      expect(maxBoostable)
        .not.to.be.greaterThanOrEqual(totalAmount);

      const fullDecay = maxBoostable.mul(2);
      // entire claim receives no boost
      expect(fullDecay)
        .not.to.be.lessThanOrEqual(previousAmount);

      // apply max boost for partial claim
      expect(previousAmount)
        .not.to.be.lessThan(maxBoostable);

      // apply no boost for partial claim
      expect(totalAmount)
        .to.be.greaterThan(fullDecay);
      adjustedAmount = adjustedAmount.add(BigNumber.from(totalAmount).sub(fullDecay).div(2));
      amount -= totalAmount - fullDecay.toNumber();

      // simplified calculation if remaining claim is the entire decay amount
      expect(amount)
        .not.to.be.equal(maxBoostable);

      // get adjusted amount based on the final boost
      const finalBoosted = BigNumber.from(amount).sub(
        BigNumber.from(amount * (previousAmount + amount - maxBoostable.toNumber())).div(maxBoostable).div(2)
      );
      adjustedAmount = adjustedAmount.add(finalBoosted);

      // get adjusted amount based on the initial boost
      const initialBoosted = BigNumber.from(amount).sub(
        BigNumber.from(amount * (previousAmount - maxBoostable.toNumber())).div(maxBoostable).div(2)
      );
      adjustedAmount = adjustedAmount.add(initialBoosted.sub(finalBoosted).div(2));

      expect(await boostCalculator.getBoostedAmount(user1.getAddress(), oriAmount, oriPreviousAmount, totalWeeklyEmissions))
        .to.be.equal(adjustedAmount);
    });
  });

  describe("getClaimableWithBoost(address, uint256, uint256)", async () => {
    it("Return claimable with boost when current is before the MAX_BOOST_GRACE_WEEKS.", async () => {
      const oriPreviousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now());
      expect(week)
        .to.be.lessThan(maxBoostGraceWeeks);

      const remaining = totalWeeklyEmissions - oriPreviousAmount;
      const [maxBoosted, boosted] = await boostCalculator.getClaimableWithBoost(user1.getAddress(), oriPreviousAmount, totalWeeklyEmissions);
      expect(maxBoosted)
        .to.be.equal(boosted)
        .to.be.equal(remaining);
    });

    it("Return claimable with boost if the pct is 0.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await time.increase(WEEK);

      const oriPreviousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const ownerWeight = await tokenLocker.getAccountWeightAt(owner.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(ownerWeight).to.be.equal(0);
      expect(totalWeight).to.be.equal(0);

      const [maxBoosted, boosted] = await boostCalculator.getClaimableWithBoost(owner.getAddress(), oriPreviousAmount, totalWeeklyEmissions);
      expect(maxBoosted)
        .to.be.equal(boosted)
        .to.be.equal(0);
    });

    it("Return claimable with boost when previousAmount less than maxBoostable.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriPreviousAmount = 100;
      const totalWeeklyEmissions = 2000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct)
        .not.to.be.equal(0);

      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      const fullDecay = maxBoostable.mul(2);

      expect(oriPreviousAmount)
        .to.be.lessThan(maxBoostable)
        .to.be.lessThan(fullDecay);

      const [maxBoosted, boosted] = await boostCalculator.getClaimableWithBoost(user1.getAddress(), oriPreviousAmount, totalWeeklyEmissions);
      expect(maxBoosted)
        .to.be.equal(maxBoostable.sub(oriPreviousAmount));
      expect(boosted)
        .to.be.equal(fullDecay.sub(maxBoostable));
    });

    it("Return claimable with boost when previousAmount greater than fullDecay.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const oriPreviousAmount = 100;
      const totalWeeklyEmissions = 100;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const user1Weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(user1Weight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      const pct = _1E9.mul(user1Weight).div(totalWeight);
      expect(pct)
        .not.to.be.equal(0);

      const maxBoostable = pct.mul(totalWeeklyEmissions).div(_1E9);
      const fullDecay = maxBoostable.mul(2);

      expect(oriPreviousAmount)
        .to.be.greaterThanOrEqual(maxBoostable)
        .to.be.greaterThanOrEqual(fullDecay);

      const [maxBoosted, boosted] = await boostCalculator.getClaimableWithBoost(user1.getAddress(), oriPreviousAmount, totalWeeklyEmissions);
      expect(maxBoosted)
        .to.be.equal(boosted)
        .to.be.equal(0);
    });
  });

  describe("getBoostedAmountWrite(address, uint256, uint256)", async () => {
    it("Return boosted amount when current is before the MAX_BOOST_GRACE_WEEKS.", async () => {
      const account = user1;
      const amount = 100;
      const previousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now());
      expect(week)
        .to.be.lessThan(maxBoostGraceWeeks);

      expect(await boostCalculator.callStatic.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions))
        .to.be.equal(amount);
    });

    it("Return when totalWeight is 0.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await time.increase(WEEK);

      const account = user1;
      const amount = 100;
      const previousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const accountWeight = await tokenLocker.getAccountWeightAt(account.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(accountWeight).to.be.equal(0);
      expect(totalWeight).to.be.equal(0);

      await expect(boostCalculator.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions))
        .not.to.be.reverted;
    });

    it("Return when account Weight is 0.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const account = user1;
      const amount = 100;
      const previousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const accountWeight = await tokenLocker.getAccountWeightAt(account.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(accountWeight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      await expect(boostCalculator.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions))
        .not.to.be.reverted;
    });

    it("Return when totalWeight isn't 0.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const account = user1;
      const amount = 100;
      const previousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const accountWeight = await tokenLocker.getAccountWeightAt(account.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(accountWeight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      // write to storage
      await boostCalculator.getBoostedAmountWrite(user2.getAddress(), amount, previousAmount, totalWeeklyEmissions);

      await expect(boostCalculator.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions))
        .not.to.be.reverted;
    });

    it("Return when pct isn't 0.", async () => {
      await time.increaseTo(getNthWeek(startTimestamp.toNumber(), maxBoostGraceWeeks.toNumber()));
      await allUsersLock();
      await time.increase(WEEK);

      const account = user1;
      const amount = 100;
      const previousAmount = 100;
      const totalWeeklyEmissions = 1000;

      const week = getWeek(startTimestamp.toNumber(), await now()) - 1;
      const accountWeight = await tokenLocker.getAccountWeightAt(account.getAddress(), week);
      const totalWeight = await tokenLocker.getTotalWeightAt(week);
      expect(accountWeight).to.be.equal(10);
      expect(totalWeight).to.be.equal(100);

      // write to storage
      await boostCalculator.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions);

      await expect(boostCalculator.getBoostedAmountWrite(account.getAddress(), amount, previousAmount, totalWeeklyEmissions))
        .not.to.be.reverted;
    });
  });
});
