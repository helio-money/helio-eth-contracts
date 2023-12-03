import { Block } from "@ethersproject/providers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { ListaCore, ListaToken, MockIncentiveVoting, MockInternalTokenLocker } from "../../../../typechain-types";
import { DAY, ETHER, HOUR, TokenLockerHelper, WEEK, ZERO_ADDRESS, _1E18, getNthWeek, getWeek, nextWeekDay } from "../../utils";
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("TokenLocker Contract", async () => {
  const FAKE_GUARDIAN_ADDRESS = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";
  const INIT_LISTA_TOKEN_BALANCE = ETHER.mul(1000);
  let START_TIMESTAMP: BigNumber;
  let MAX_LOCK_WEEKS: BigNumber;

  let tokenLocker: MockInternalTokenLocker;
  let listaCore: ListaCore;
  let listaToken: ListaToken;
  let incentiveVoting: MockIncentiveVoting;

  let owner: Signer;
  let feeReceiver: Signer;
  let manager: Signer;
  let vault: Signer;
  let user1: Signer;
  let user2: Signer;

  let helper: TokenLockerHelper;

  beforeEach(async () => {
    [owner, feeReceiver, manager, vault, user1, user2] = await ethers.getSigners();

    listaCore = await ethers.deployContract("ListaCore", [
      await owner.getAddress(),
      FAKE_GUARDIAN_ADDRESS,
      ZERO_ADDRESS,
      await feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    // set START_TIMESTAMP
    START_TIMESTAMP = await listaCore.startTime();

    // deploy TokenLocker
    // set listaToken and incentiveVoting later
    tokenLocker = await ethers.deployContract("MockInternalTokenLocker", [
      listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await manager.getAddress(),
      _1E18,
    ]) as MockInternalTokenLocker;

    // set MAX_LOCK_WEEKS
    MAX_LOCK_WEEKS = await tokenLocker.MAX_LOCK_WEEKS();

    // deploy ListaToken
    listaToken = await ethers.deployContract("ListaToken", [
      // ZERO_ADDRESS,
      await vault.getAddress(),
      ZERO_ADDRESS,
      tokenLocker.address,
    ]) as ListaToken;
    await listaToken.deployed();

    // deploy MockIncentiveVoting
    incentiveVoting = await ethers.deployContract("MockIncentiveVoting") as MockIncentiveVoting;
    await incentiveVoting.deployed();

    // mint INIT_LISTA_TOKEN_BALANCE(1000) listaToken to each user
    await listaToken.connect(vault).mintToVault(INIT_LISTA_TOKEN_BALANCE.mul(10));
    await listaToken.connect(vault).transfer(owner.getAddress(), INIT_LISTA_TOKEN_BALANCE);
    await listaToken.connect(vault).transfer(user1.getAddress(), INIT_LISTA_TOKEN_BALANCE);
    await listaToken.connect(vault).transfer(user2.getAddress(), INIT_LISTA_TOKEN_BALANCE);

    // set listaToken and incentiveVoting after deployment
    await tokenLocker.setLockToken(listaToken.address);
    await tokenLocker.setIncentiveVoter(incentiveVoting.address);

    helper = new TokenLockerHelper(tokenLocker, START_TIMESTAMP, MAX_LOCK_WEEKS);
  });

  it("MAX_LOCK_WEEKS cannot be greater than 256", async () => {
    expect(await tokenLocker.MAX_LOCK_WEEKS()).to.lessThanOrEqual(256);
  });

  describe("setLockToken(IListaToken)", async () => {
    it("Set a new lock token", async () => {
      await tokenLocker.setLockToken(FAKE_GUARDIAN_ADDRESS);
      expect(await tokenLocker.lockToken()).to.equal(FAKE_GUARDIAN_ADDRESS);
    });

    it("Set zero address as lock token", async () => {
      await tokenLocker.setLockToken(ZERO_ADDRESS);
      expect(await tokenLocker.lockToken()).to.equal(ZERO_ADDRESS);
    });
  });

  describe("setIncentiveVoter(IIncentiveVoting)", async () => {
    it("Set a new incentive voter", async () => {
      await tokenLocker.setIncentiveVoter(FAKE_GUARDIAN_ADDRESS);
      expect(await tokenLocker.incentiveVoter()).to.equal(FAKE_GUARDIAN_ADDRESS);
    });

    it("Set zero address as incentive voter", async () => {
      await tokenLocker.setIncentiveVoter(ZERO_ADDRESS);
      expect(await tokenLocker.incentiveVoter()).to.equal(ZERO_ADDRESS);
    });
  });

  describe("setAllowPenaltyWithdrawAfter(uint256)", async () => {
    let block: Block;

    beforeEach(async () => {
      block = await ethers.provider.getBlock("latest");
    });

    it("Should revert if not called by manager", async () => {
      await expect(tokenLocker.connect(user1).setAllowPenaltyWithdrawAfter(block.timestamp + DAY))
        .to.be.revertedWith("!deploymentManager");
    });

    it("Should revert if allowPenaltyWithdrawAfter had been set", async () => {
      // set once
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(block.timestamp + DAY);

      // set again
      await expect(tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(0))
        .to.be.revertedWith("Already set");
    });

    it("Should revert if allowPenaltyWithdrawAfter is less than and equal to current block timestamp", async () => {
      await expect(tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(block.timestamp - DAY))
        .to.be.revertedWith("Invalid timestamp");

      await expect(tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(block.timestamp))
        .to.be.revertedWith("Invalid timestamp");
    });

    it("Should revert if allowPenaltyWithdrawAfter is greater than and equal to current block timestamp + 13 weeks", async () => {
      await expect(tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(block.timestamp + 13 * WEEK + HOUR))
        .to.be.revertedWith("Invalid timestamp");
    });

    it("Set allowPenaltyWithdrawAfter", async () => {
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(block.timestamp + DAY);
      expect(await tokenLocker.allowPenaltyWithdrawAfter()).to.equal(block.timestamp + DAY);
    });
  });

  describe("setPenaltyWithdrawalsEnabled(bool)", async () => {
    it("Should revert if not called by owner", async () => {
      await expect(tokenLocker.connect(user1).setPenaltyWithdrawalsEnabled(true))
        .to.be.revertedWith("Only owner");
    });

    it("Should revert if allowPenaltyWithdrawAfter has not been set", async () => {
      await expect(tokenLocker.setPenaltyWithdrawalsEnabled(true))
        .to.be.revertedWith("Not yet!");
    });

    it("Should revert if allowPenaltyWithdrawAfter has been set but not passed", async () => {
      // should set allowPenaltyWithdrawAfter first
      const allowPenaltyWithdrawAfter = (await ethers.provider.getBlock("latest")).timestamp + DAY;
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(allowPenaltyWithdrawAfter);

      // block.timestamp < allowPenaltyWithdrawAfter
      await expect(tokenLocker.setPenaltyWithdrawalsEnabled(true))
        .to.be.revertedWith("Not yet!");
    });

    it("Set penaltyWithdrawalsEnabled to true", async () => {
      // should set allowPenaltyWithdrawAfter first
      const allowPenaltyWithdrawAfter = (await ethers.provider.getBlock("latest")).timestamp + DAY;
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(allowPenaltyWithdrawAfter);

      // after 1 day
      await time.increase(DAY);

      // block.timestamp >= allowPenaltyWithdrawAfter
      await tokenLocker.setPenaltyWithdrawalsEnabled(true);
      expect(await tokenLocker.penaltyWithdrawalsEnabled()).to.be.true;
    });
  });

  describe("getAccountBalances(address)", async () => {
    it("Return 0 if the account has no locked tokens", async () => {
      const [locked, unlocked] = await tokenLocker.getAccountBalances(user1.getAddress());
      expect(locked).to.equal(0);
      expect(unlocked).to.equal(0);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });

    it("Return locked and unlocked tokens", async () => {
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // check
      const [locked, unlocked] = await tokenLocker.getAccountBalances(user1.getAddress());
      expect(locked).to.equal(1);
      expect(unlocked).to.equal(0);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(1)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });

    it("Return frozen if the account is frozen", async () => {
      // lock 1 token for 2 weeks and freeze all
      await helper.lockAndFreeze(user1);

      // get account balances
      const [locked, unlocked] = await tokenLocker.getAccountBalances(user1.getAddress());

      // check
      expect(locked).to.equal(1);
      expect(unlocked).to.equal(0);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(1)
        .expectUnlockedEqual(0);
    });

    it("Return locked after unlocked", async () => {
      // jump to the 250th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 250));
      // lock 1 token for 20 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 20);

      // jump to the 280th week(after unlocked week)
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 280));

      // get account balances
      const [locked, unlocked] = await tokenLocker.getAccountBalances(user1.getAddress());

      // check

      // getAccountBalances() returns updated locked and unlocked tokens
      expect(locked).to.equal(0);
      expect(unlocked).to.equal(1);

      // getAccountBalances() doesn't update any data on chain
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(1)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0)
        .expectWeekEqual(250);
    });
  });

  describe("getAccountWeight(address)", async () => {
    it("The same as getAccountWeightAt(address, getWeek())", async () => {
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get account weight at current week
      const weight = await tokenLocker.getAccountWeight(user1.getAddress());
      const weightAt = await tokenLocker.getAccountWeightAt(user1.getAddress(), await helper.getCurWeek());

      // check
      expect(weight).to.equal(weightAt);
    });
  });

  describe("getAccountWeightAt(address, uint256)", async () => {
    it("Return 0 if the week is greater than the current week", async () => {
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get account weight at current week
      const weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), await helper.getCurWeek() + 1);

      // check
      expect(weight).to.be.equal(0);
    });

    it("Return the last updated weight if the account is frozen", async () => {
      // lock 1 token for 2 weeks and freeze all
      await helper.lockAndFreeze(user1);
      const weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), await helper.getCurWeek());

      // jump to next 10 weeks
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 10));

      // get account weight at current week
      const nowWeight = await tokenLocker.getAccountWeightAt(user1.getAddress(), await helper.getCurWeek());

      // check
      expect(weight).to.be.equal(helper.maxLockWeeks.mul(1));
      expect(weight).to.be.equal(nowWeight);
    });

    it("Return weeklyWeights if the week is less than the accountData.week", async () => {
      // jump to the 10th week

      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get account weight at current week
      const weight = await tokenLocker.getAccountWeightAt(user1.getAddress(), 5);

      // check
      expect(weight).to.be.equal(0);
    });

    it("Return weight before and after unlocked", async () => {
      // jump to the 250th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 250));

      // lock 1 token for 10 weeks(unlock at 260th week)
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 10);

      // jump to the 280th week(after unlocked week)
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 280));

      // get weight at different weeks
      const weightBefore5Week = await tokenLocker.getAccountWeightAt(user1.getAddress(), 255);
      const weightAtUnlockedWeek = await tokenLocker.getAccountWeightAt(user1.getAddress(), 260);
      const weightAfter5Week = await tokenLocker.getAccountWeightAt(user1.getAddress(), 265);

      // check weight
      expect(weightBefore5Week).to.equal(1 * (10 - 5));
      expect(weightAtUnlockedWeek).to.equal(0);
      expect(weightAfter5Week).to.equal(0);

      // getAccountBalances() doesn't update any data on chain
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(1)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0)
        .expectWeekEqual(250);
    });
  });

  describe("getAccountActiveLocks(address, uint256)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 2 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 4, unlockWeek: 4 }, // lock 2 token for 4 weeks
    ]
    const week = 0;

    // init and check locked data
    beforeEach(async () => {
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Return if the account is frozen", async () => {
      await helper.freeze(user1);

      // get account active locks in 3 weeks
      const [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 3);

      // check
      expect(locks.length).to.equal(0);
      expect(frozen).to.equal(3);
    });

    it("Return atLease 1 weeks if the minWeeks is 0", async () => {
      // get account active locks
      const [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 0);
      const [locks1, frozen1] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 1);

      // check
      expect(locks.length).to.equal(2);
      expect(frozen).to.equal(0);
      expect(locks1.length).to.equal(2);
      expect(frozen1).to.equal(0);
    });

    it("Return empty if minWeeks is greater than the MAX_LOCK_WEEKS", async () => {
      // get account active locks
      const [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), MAX_LOCK_WEEKS.add(1));

      // check
      expect(locks.length).to.equal(0);
      expect(frozen).to.equal(0);
    });

    it("Return from different weeks", async () => {
      // jump to the 1st week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 1));

      // get account active locks from 1st week
      let [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 1);

      // check
      expect(locks.length).to.equal(2);
      expect(locks[0].amount).to.equal(2);
      expect(locks[0].weeksToUnlock).to.equal(3); // unlocked week from current week is 3
      expect(locks[1].amount).to.equal(1);
      expect(locks[1].weeksToUnlock).to.equal(1); // unlocked week from current week is 1
      expect(frozen).to.equal(0);

      // get account active locks from 2nd week
      [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 2);

      // check
      expect(locks.length).to.equal(1);
      expect(locks[0].amount).to.equal(2);
      expect(locks[0].weeksToUnlock).to.equal(3); // unlocked week from current week is 3
      expect(frozen).to.equal(0);

      // jump to the 250th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 250));
      // get account active locks from 1st week
      [locks, frozen] = await tokenLocker.getAccountActiveLocks(user1.getAddress(), 1);

      // check
      expect(locks.length).to.equal(0);
      expect(frozen).to.equal(0);
    });
  });

  describe("getWithdrawWithPenaltyAmounts(address, uint256)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 256 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 4, unlockWeek: 258 }, // lock 2 token for 4 weeks
    ]

    // init and check locked data
    beforeEach(async () => {
      // jumpt 254th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 254));

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Should overflow if amountWithDrawn is greater than MaxUint256 / 1e18", async () => {
      await expect(tokenLocker.getWithdrawWithPenaltyAmounts(user1.getAddress(), ethers.constants.MaxUint256.div(_1E18).add(1)))
        .to.be.revertedWithPanic(0x11);
    });

    it("Return without penalty if the unlocked is greater than and equal to amountWithDrawn", async () => {
      // jump to the 260th week(all unlocked)
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));

      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // get withdraw with penalty amounts
      const [amountWithdrawn, penaltyAmountPaid] = await tokenLocker.getWithdrawWithPenaltyAmounts(user1.getAddress(), 3);

      // check
      expect(amountWithdrawn).to.equal(ETHER.mul(3));
      expect(penaltyAmountPaid).to.equal(0);
    });

    it("Return with penalty at the current week", async () => {
      // get withdraw with penalty amounts
      const [amountWithdrawn, penaltyAmountPaid] = await tokenLocker.getWithdrawWithPenaltyAmounts(user1.getAddress(), 2);

      // check
      expect(amountWithdrawn).to.equal(ETHER.mul(2));
      expect(penaltyAmountPaid).to.equal(ETHER);
    });

    it("Return with penalty at the 3rd week", async () => {
      // jump to the 257th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 257));
      // get balance before withdraw
      const [locked, unlocked] = await tokenLocker.connect(user1).getAccountBalances(user1.getAddress());
      expect(locked).to.equal(2);
      expect(unlocked).to.equal(1);

      // get withdraw with penalty amounts
      const [amountWithdrawn, penaltyAmountPaid] = await tokenLocker.getWithdrawWithPenaltyAmounts(user1.getAddress(), 2);

      // check
      expect(amountWithdrawn).to.equal(ETHER.mul(2));
      expect(penaltyAmountPaid).to.equal(ETHER);

      // don't update account data
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(3)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0)
        .expectWeekEqual(254);
    });

    it("Return if withdraw amount is greater than the unlocked", async () => {
      // get withdraw with penalty amounts
      const [amountWithdrawn, penaltyAmountPaid] = await tokenLocker.getWithdrawWithPenaltyAmounts(user1.getAddress(), 4);

      // penaltyAmountPaid = penalty1(lock 1 amount for 2 weeks) + penalty2(lock 2 amount for 4 weeks)
      // penalty1(256th week):
      //   penalty1 = 2e18 * (2) / 52 = 38461538461538461
      //   remaining = 4e18 - (1e18 - penalty1) = 3038461538461538461
      // penalty2(258th week):
      //   penalty2 = 2e18 * (4) / 52 = 153846153846153846
      //   remaining = 3038461538461538461 - (2e18 - penalty2) = 1192307692307692307

      // amountWithdrawn = 4e18 - remaining = 2807692307692307693
      // penaltyAmountPaid = penalty1 + penalty2 = 38461538461538461 + 153846153846153846 = 192307692307692307

      const offset = 0;
      let expectedAmountWithdrawn = ETHER.mul(4);
      let expectedPenaltyTotal = BigNumber.from(0);
      let remaining = expectedAmountWithdrawn;

      // calcualte penalty1
      let unlocks = ETHER;
      let weeksToUnlock = 2;
      let penalty1 = unlocks.mul(weeksToUnlock - offset).div(MAX_LOCK_WEEKS); // 38461538461538461
      remaining = remaining.sub(unlocks.sub(penalty1)); // 3038461538461538461

      // calcualte penalty2
      unlocks = ETHER.mul(2);
      weeksToUnlock = 4;
      let penalty2 = unlocks.mul(weeksToUnlock - offset).div(MAX_LOCK_WEEKS); // 153846153846153846
      remaining = remaining.sub(unlocks.sub(penalty2)); // 1192307692307692307

      // finally
      expectedAmountWithdrawn = expectedAmountWithdrawn.sub(remaining); // 2807692307692307693
      expectedPenaltyTotal = expectedPenaltyTotal.add(penalty1).add(penalty2); // 192307692307692307

      // check
      expect(amountWithdrawn).to.equal(expectedAmountWithdrawn);
      expect(penaltyAmountPaid).to.equal(expectedPenaltyTotal);
    });
  });

  describe("getTotalWeight()", async () => {
    it("The same as getTotalWeightAt(getWeek())", async () => {
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get total weight at current week
      const weight = await tokenLocker.getTotalWeight();
      const weightAt = await tokenLocker.getTotalWeightAt(await helper.getCurWeek());

      // check
      expect(weight).to.equal(weightAt);
    });
  });

  describe("getTotalWeightAt(uint256)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 256 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 10, unlockWeek: 264 }, // lock 2 token for 10 weeks
    ]
    const week = 254;

    // init and check locked data
    beforeEach(async () => {
      // jumpt 254th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 254));

      // check current week
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1).lock(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Return 0 if the week is greater than the current week", async () => {
      // get total weight at the next week
      const weight = await tokenLocker.getTotalWeightAt(await helper.getNextNthWeek(1));

      // check
      expect(weight).to.equal(0);
    });

    it("Return if the week is less than the updated week", async () => {
      // update total weight
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // get total weight at the 250th week
      const week = 250;
      const weight = await tokenLocker.connect(user1).getTotalWeightAt(week);

      expect(week).to.be.lessThan(await tokenLocker.totalUpdatedWeek());
      expect(weight).to.equal(0);
    });

    it("Return if the totalDecayRate is 0 or updatedWeek is greater than systemWeek", async () => {
      // jump to the 265th week, all unlocked
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 265));
      // update total weight
      await tokenLocker.connect(user1).getTotalWeightWrite();
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));

      // get total weight at the 268th week
      const weight = await tokenLocker.connect(user1).getTotalWeightAt(268);

      // check
      expect(weight).to.equal(0);
    });

    it("Return weight if updatedWeek is less than systemWeek", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));
      // update total weight
      await tokenLocker.connect(user1).getTotalWeightWrite();
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));

      // get total weight at the 269th week
      const weight = await tokenLocker.connect(user1).getTotalWeightAt(268);

      // check
      expect(weight).to.equal(0);
    });
  });

  describe("getAccountWeightWrite(address)", async () => {
    it("The same as _weeklyWeightWrite(address)", async () => {
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get account weight write
      const weight = await tokenLocker.connect(user1).callStatic.getAccountWeightWrite(user1.getAddress());
      const internalWeight = await tokenLocker.connect(user1).callStatic._weeklyWeightWriteInternal(user1.getAddress());

      // check
      expect(weight).to.equal(2); // 1 * 2
      expect(weight).to.equal(internalWeight);
    });
  });

  describe("getTotalWeightWrite()", async () => {
    it("Return 0 if the last updated weight is 0", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));

      // get total weight write
      const weight = await tokenLocker.connect(user1).callStatic.getTotalWeightWrite();

      // check
      expect(weight).to.equal(0);
    });

    it("update weight if updatedWeek is less than systemWeek", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));
      // lock 1 token for 2 weeks
      await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 2);

      // get total weight write
      const weight = await tokenLocker.connect(user1).callStatic.getTotalWeightWrite();

      // check
      expect(weight).to.equal(2); // 1 * 2
    });

  });

  describe("lock(address, uint256, uint256)", async () => {
    it("Should revert if balance is less than amount", async () => {
      await expect(tokenLocker.lock(await user1.getAddress(), 1001, 1))
        .to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should revert if lock 0 week", async () => {
      await expect(tokenLocker.lock(await user1.getAddress(), 1, 0))
        .to.be.revertedWith("Min 1 week");
    });

    it("Should revert if lock 0 amount", async () => {
      await expect(tokenLocker.lock(await user1.getAddress(), 0, 1))
        .to.be.revertedWith("Amount must be nonzero");
    });

    it("Should revert if lockToken has not been set", async () => {
      await tokenLocker.setLockToken(ZERO_ADDRESS);
      await expect(tokenLocker.lock(await user1.getAddress(), 1, 1))
        .to.be.reverted;
    });

    it("Should transfer amount from user to tokenLocker", async () => {
      expect(await tokenLocker.connect(user1).lock(user1.getAddress(), 1, 1)).not.to.be.reverted;

      // check balance of user1 and tokenLocker
      expect(await listaToken.balanceOf(tokenLocker.address)).to.equal(ETHER);
      expect(await listaToken.balanceOf(user1.getAddress())).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER));

      // check lock data
      const [locked, unlocked] = await tokenLocker.getAccountBalances(user1.getAddress());
      expect(locked).to.equal(1);
      expect(unlocked).to.equal(0);
    });
  });

  describe("_lock(address, uint256, uint256)", async () => {
    let block: Block;

    beforeEach(async () => {
      block = await ethers.provider.getBlock("latest");
    });

    it("Should revert if _weeks is greater than MAX_LOCK_WEEKS", async () => {
      await expect(tokenLocker.connect(user1)._lockInternal(await user1.getAddress(), 1, MAX_LOCK_WEEKS.add(1)))
        .to.be.revertedWith("Exceeds MAX_LOCK_WEEKS");
    });

    it("Treat as 1 weeks if _weeks is 1 and now is the first 4 days of the week", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);
      // jump to the next first day of the week
      await time.increaseTo(nextWeekDay(START_TIMESTAMP.toNumber(), block.timestamp, 0));
      // then lock 1 token for 1 week, the actual locked weeks should be 1
      await tokenLocker.connect(user1)._lockInternal(await user1.getAddress(), lockAmount, lockWeeks);

      // check lock data
      const weight = await tokenLocker.connect(user1).getAccountWeight(user1.getAddress())
      expect(weight).to.equal(lockAmount);
    });

    it("Treat as 2 weeks if _weeks is 1 and now is the final 3 days of the week", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);
      // jump to the next final day of the week
      await time.increaseTo(nextWeekDay(START_TIMESTAMP.toNumber(), block.timestamp, 6));
      // then lock 1 token for 1 week, the actual locked weeks should be 2
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // check lock data
      const weight = await tokenLocker.connect(user1).getAccountWeight(user1.getAddress())
      expect(weight).to.equal(lockAmount.mul(2));
    });

    it("Lock more than 1 week in the first 4 days of the week", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(2);
      // jump to the next first day of the week
      await time.increaseTo(nextWeekDay(START_TIMESTAMP.toNumber(), block.timestamp, 0));

      // check the accountData.updateWeeks shouldn't be updated
      const accountLockDataBefore = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockDataBefore.updateWeeks[getWeek(START_TIMESTAMP.toNumber(), block.timestamp)]).to.be.equal(0);

      // then lock 1 token for 2 weeks, the actual locked weeks should be 2
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // check lock data
      const weight = await tokenLocker.connect(user1).getAccountWeight(user1.getAddress())
      expect(weight).to.equal(lockAmount.mul(lockWeeks));

      // check accountData.updateWeeks should be updated after lock
      const accountLockDataAfter = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockDataAfter.updateWeeks[getWeek(START_TIMESTAMP.toNumber(), block.timestamp)]).not.to.be.equal(0);
    });

    it("Lock more than 1 week in the final 3 days of the week", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(2);
      // jump to the next final day of the week
      await time.increaseTo(nextWeekDay(START_TIMESTAMP.toNumber(), block.timestamp, 6));

      // check the accountData.updateWeeks shouldn't be updated
      const accountLockDataBefore = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockDataBefore.updateWeeks[getWeek(START_TIMESTAMP.toNumber(), block.timestamp)]).to.be.equal(0);

      // then lock 1 token for 2 weeks, the actual locked weeks should be 2
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // check lock data
      const weight = await tokenLocker.connect(user1).getAccountWeight(user1.getAddress())
      expect(weight).to.equal(lockAmount.mul(lockWeeks));

      // check accountData.updateWeeks should be updated after lock
      const accountLockDataAfter = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockDataAfter.updateWeeks[getWeek(START_TIMESTAMP.toNumber(), block.timestamp)]).not.to.be.equal(0);
    });

    it("Lock when the account is frozen", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);

      // jump to the next first day of the week
      await time.increaseTo(nextWeekDay(START_TIMESTAMP.toNumber(), block.timestamp, 0));

      // lock 1 token for 2 weeks
      await helper.lockAndFreeze(user1);

      // check the accountData
      const accountLockDataBefore = await helper.getAccountData(user1);
      accountLockDataBefore
        .expectLockedEqual(0)
        .expectFrozenEqual(lockAmount);

      // now the account is frozen, lock 1 token for 2 weeks again
      await tokenLocker.connect(user1).lock(user1.getAddress(), lockAmount, lockWeeks);

      // check the accountData
      const accountLockDataAfter = await helper.getAccountData(user1);
      accountLockDataAfter
        .expectLockedEqual(0)
        .expectFrozenEqual(lockAmount.mul(2));
    });

  });

  describe("extendLock(uint256, uint256, uint256)", async () => {
    const lockAmount = BigNumber.from(2);
    const lockWeeks = BigNumber.from(2);
    const newWeeks = BigNumber.from(3);

    beforeEach(async () => {
      // lock 2 token for 2 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);
    });

    it("Should revert if the account is frozen", async () => {
      // freeze the account
      await tokenLocker.connect(user1).freeze();

      // extend the lock
      await expect(tokenLocker.connect(user1).extendLock(lockAmount, lockWeeks, newWeeks))
        .to.be.revertedWith("Lock is frozen");
    });

    it("Shoud revert if _weeks is 0", async () => {
      await expect(tokenLocker.connect(user1).extendLock(lockAmount, 0, newWeeks))
        .to.be.revertedWith("Min 1 week");
    });

    it("Should revert if _weeks is greater than MAX_LOCK_WEEKS", async () => {
      await expect(tokenLocker.connect(user1).extendLock(lockAmount, MAX_LOCK_WEEKS.add(1), MAX_LOCK_WEEKS.add(2)))
        .to.be.revertedWith("Exceeds MAX_LOCK_WEEKS");
    });

    it("Should revert if _newWeeks is less than _weeks", async () => {
      await expect(tokenLocker.connect(user1).extendLock(lockAmount, lockWeeks, lockWeeks.sub(1)))
        .to.be.revertedWith("newWeeks must be greater than weeks");
    });

    it("Should revert if _amount is 0", async () => {
      await expect(tokenLocker.connect(user1).extendLock(0, lockWeeks, newWeeks))
        .to.be.revertedWith("Amount must be nonzero");
    });

    it("Should revert if the previos unlocks are not enough", async () => {
      // reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)
      await expect(tokenLocker.connect(user1).extendLock(lockAmount.add(1), lockWeeks, newWeeks))
        .to.be.revertedWithPanic(0x11);
    });

    it("Extend partial unlocks", async () => {
      await expect(tokenLocker.connect(user1).extendLock(1, lockWeeks, newWeeks))
        .not.to.be.reverted;

      // check
      await helper.expectAccountWeeklyUnlocksEqual(user1, 2, 1);
      await helper.expectAccountWeeklyUnlocksEqual(user1, 3, 1);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(2)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });

    it("Extend all unlocks in one week", async () => {
      await expect(tokenLocker.connect(user1).extendLock(lockAmount, lockWeeks, newWeeks))
        .not.to.be.reverted;

      // check
      await helper.expectAccountWeeklyUnlocksEqual(user1, 3, 2);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(2)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });
  });

  describe("lockMany(address, LockData[])", async () => {
    it("Should revert if the account is frozen", async () => {
      // lock 1 token for 1 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), 1, 1);

      // freeze the account
      await tokenLocker.connect(user1).freeze();

      // lock many
      await expect(tokenLocker.connect(user1).lockMany(user1.getAddress(), []))
        .to.be.revertedWith("Lock is frozen");
    });

    it("Should revert if any lock amount is 0", async () => {
      // lock many
      await expect(tokenLocker.connect(user1).lockMany(user1.getAddress(), [
        { amount: 0, weeksToUnlock: 1 },
        { amount: 1, weeksToUnlock: 1 },
      ]))
        .to.be.revertedWith("Amount must be nonzero");
    });

    it("Should revert if any lock week is 0", async () => {
      // lock many
      await expect(tokenLocker.connect(user1).lockMany(user1.getAddress(), [
        { amount: 1, weeksToUnlock: 0 },
        { amount: 1, weeksToUnlock: 1 },
      ]))
        .to.be.revertedWith("Min 1 week");
    });

    it("Should revert if any lock week is greater than MAX_LOCK_WEEKS", async () => {
      // lock many
      await expect(tokenLocker.connect(user1).lockMany(user1.getAddress(), [
        { amount: 1, weeksToUnlock: MAX_LOCK_WEEKS.add(1) },
        { amount: 1, weeksToUnlock: 1 },
      ]))
        .to.be.revertedWith("Exceeds MAX_LOCK_WEEKS");
    });

    it("Lock many successfully", async () => {
      // lock many
      await expect(tokenLocker.connect(user1).lockMany(user1.getAddress(), [
        { amount: 2, weeksToUnlock: 2 },
        { amount: 3, weeksToUnlock: 3 },
      ]))
        .not.to.be.reverted;

      // check
      await helper.expectAccountWeeklyUnlocksEqual(user1, 2, 2);
      await helper.expectAccountWeeklyUnlocksEqual(user1, 3, 3);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(5)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });
  });

  describe("extendMany(ExtendLockData[])", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 2 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 4, unlockWeek: 4 }, // lock 2 token for 4 weeks
    ]
    const week = 0;
    const accountLocked = lockedDatas
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0)); // 3
    const accountWeight = lockedDatas
      .reduce((acc, cur) => acc.add(cur.amount * cur.weeks), BigNumber.from(0)); // 10

    // init and check locked data
    beforeEach(async () => {
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Should revert if the account is frozen", async () => {
      // freeze the account
      await helper.freeze(user1);

      // extend many
      await expect(tokenLocker.connect(user1).extendMany([]))
        .to.be.revertedWith("Lock is frozen");
    });

    it("Should revert if any oldWeeks is 0", async () => {
      // extend many
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 },
        { amount: 1, currentWeeks: 0, newWeeks: 4 },
      ]))
        .to.be.revertedWith("Min 1 week");

      // check weights didn't change
      await helper.expectAccountWeeklyWeightsEqual(user1, week, accountWeight);
    });

    it("Should revert if any newWeeks is greater than MAX_LOCK_WEEKS", async () => {
      // extend many
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 },
        { amount: 1, currentWeeks: 4, newWeeks: MAX_LOCK_WEEKS.add(1) },
      ]))
        .to.be.revertedWith("Exceeds MAX_LOCK_WEEKS");

      // check weights didn't change
      await helper.expectAccountWeeklyWeightsEqual(user1, week, accountWeight);
    });

    it("Should revert if nay oldWeeks is greater than and equal to newWeeks", async () => {
      // extend many
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 },
        { amount: 1, currentWeeks: 4, newWeeks: 4 },
      ]))
        .to.be.revertedWith("newWeeks must be greater than weeks");

      // check weights didn't change
      await helper.expectAccountWeeklyWeightsEqual(user1, week, accountWeight);
    });

    it("Should revert if any amount is 0", async () => {
      // extend many
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 },
        { amount: 0, currentWeeks: 4, newWeeks: 5 },
      ]))
        .to.be.revertedWith("Amount must be nonzero");

      // check weights didn't change
      await helper.expectAccountWeeklyWeightsEqual(user1, week, accountWeight);
    });

    it("Should revert if any previous unlocks are not enough", async () => {
      // reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 }, // success
        { amount: 2, currentWeeks: 1, newWeeks: 5 }, // fail
      ]))
        .to.be.revertedWithPanic(0x11);

      // check weights didn't change
      await helper.expectAccountWeeklyWeightsEqual(user1, week, accountWeight);
    });

    it("Extend many successfully", async () => {
      // extend many
      await expect(tokenLocker.connect(user1).extendMany([
        { amount: 1, currentWeeks: 2, newWeeks: 3 }, // extends all unlocks in 2 weeks
        { amount: 1, currentWeeks: 4, newWeeks: 5 }, // extends partial unlocks in 4 weeks
      ]))
        .not.to.be.reverted;

      // check
      await helper.expectAccountWeeklyUnlocksEqual(user1, 3, 1);
      await helper.expectAccountWeeklyUnlocksEqual(user1, 4, 1);
      await helper.expectAccountWeeklyUnlocksEqual(user1, 5, 1);
      const newAccountWeight = 1 * 3 + 1 * 4 + 1 * 5;
      await helper.expectAccountWeeklyWeightsEqual(user1, week, newAccountWeight);
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(accountLocked)
        .expectUpdateWeeksIsFalse(2)
        .expectUpdateWeeksIsTrue(4)
        .expectUpdateWeeksIsTrue(5);
    });
  });

  describe("freeze()", async () => {
    it("Should revert if the account is already frozen", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);

      // lock 1 token for 1 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // freeze the account
      await tokenLocker.connect(user1).freeze();

      await expect(tokenLocker.connect(user1).freeze())
        .to.be.revertedWith("Lock is frozen");
    });

    it("Should revert if the account has no locked tokens", async () => {
      // freeze the account when the account has no locked tokens
      await expect(tokenLocker.connect(user1).freeze())
        .to.be.revertedWith("No locked balance");
    });

    it("Freeze all locked tokens", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);

      // lock 1 token for 1 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // lock 2 token for 2 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount.mul(2), lockWeeks.mul(2));

      // check the accountData before freeze
      let accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(lockAmount.mul(3));
      expect(accountLockData.frozen).to.be.equal(0);

      // freeze the account
      await tokenLocker.connect(user1).freeze();

      // check the accountData after freeze
      accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(0);
      expect(accountLockData.frozen).to.be.equal(lockAmount.mul(3));
    });

    it("Freeze all locked tokens at the 255th week", async () => {
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);
      // jump to the 255th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 255));

      // lock 1 token for 1 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // lock 2 token for 2 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount.mul(2), lockWeeks.mul(2));

      // check the accountData before freeze
      let accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(lockAmount.mul(3));
      expect(accountLockData.frozen).to.be.equal(0);

      // freeze the account
      await tokenLocker.connect(user1).freeze();

      // check the accountData after freeze
      accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(0);
      expect(accountLockData.frozen).to.be.equal(lockAmount.mul(3));
    });
  });

  describe("unfreeze(bool)", async () => {
    it("Should revert if the account is not frozen", async () => {
      await expect(tokenLocker.connect(user1).unfreeze(false))
        .to.be.revertedWith("Locks already unfrozen");
    });

    it("Unfreeze all locked tokens", async () => {
      // freeze 1 token
      const lockAmount = BigNumber.from(1);
      const lockWeeks = BigNumber.from(1);

      // lock 1 token for 1 weeks
      await tokenLocker.connect(user1)._lockInternal(user1.getAddress(), lockAmount, lockWeeks);

      // freeze the account
      await tokenLocker.connect(user1).freeze();

      const currentWeek = getWeek(START_TIMESTAMP.toNumber(), (await ethers.provider.getBlock("latest")).timestamp);
      const unlockWeek = currentWeek + MAX_LOCK_WEEKS.toNumber();
      const unlockWeekIdx = Math.floor(unlockWeek / 256);

      // check the accountData before unfreeze
      let accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(0);
      expect(accountLockData.frozen).to.be.equal(lockAmount);
      expect(accountLockData.updateWeeks[unlockWeekIdx].toNumber()).to.be.equal(0);

      // unfreeze the account
      await tokenLocker.connect(user1).unfreeze(false);

      // check the accountData after unfreeze
      accountLockData = await tokenLocker.getAccountLockData(user1.getAddress());
      expect(accountLockData.locked).to.be.equal(lockAmount);
      expect(accountLockData.frozen).to.be.equal(0);
      expect(accountLockData.updateWeeks[unlockWeekIdx].toNumber()).to.not.be.equal(0);
    });
  });

  describe("withdrawExpiredLocks(uint256)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 2 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 10, unlockWeek: 10 }, // lock 2 token for 10 weeks
    ]
    const week = 0;

    // init and check locked data
    beforeEach(async () => {
      // check current week
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1).lock(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Should revert if the account has 0 unlocks", async () => {
      await expect(tokenLocker.connect(user1).withdrawExpiredLocks(0))
        .to.be.revertedWith("No unlocked tokens");
    });

    it("Lock again if the week is greater than 0", async () => {
      // jump to the 20th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 20));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // check accountData before withdraw
      let accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(3);

      // withdraw expired locks and lock again for 2 weeks
      await tokenLocker.connect(user1).withdrawExpiredLocks(3);

      // check accountData after withdraw
      accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(3)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);
    });

    it("Withdraw expired locks", async () => {
      // jump to the 20th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 20));

      // check balanceof user1 and tokenLock before withdraw
      let balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      let balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3));

      // withdraw expired locks
      await tokenLocker.connect(user1).withdrawExpiredLocks(0);

      // check accountData after withdraw
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);

      // check balance of user1 and tokenLocker
      // check balanceof user1 and tokenLock after withdraw
      balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE);
      expect(balanceOfTokenLocker).to.equal(0);
    });
  });

  describe("withdrawWithPenalty(uint256)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 256 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 10, unlockWeek: 264 }, // lock 2 token for 10 weeks
    ]
    const week = 254;

    // init and check locked data
    beforeEach(async () => {
      // enabled penalty withdrawals
      const startAllowPenaltyWithdrawAfter = nextWeekDay(START_TIMESTAMP.toNumber(), (await ethers.provider.getBlock("latest")).timestamp, 0);
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(startAllowPenaltyWithdrawAfter);
      // jump to startAllowPenaltyWithdrawAfter
      await time.increaseTo(startAllowPenaltyWithdrawAfter + 1);
      await tokenLocker.connect(owner).setPenaltyWithdrawalsEnabled(true);

      // jumpt 254th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 254));

      // check current week
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1).lock(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Should revert if the account is frozen", async () => {
      // freeze the account
      await helper.freeze(user1);

      // withdraw with penalty
      await expect(tokenLocker.connect(user1).withdrawWithPenalty(0))
        .to.be.revertedWith("Lock is frozen");
    });

    it("Should revert if penaltyWithdrawalsEnabled is false", async () => {
      await tokenLocker.connect(owner).setPenaltyWithdrawalsEnabled(false);

      // withdraw with penalty
      await expect(tokenLocker.connect(user1).withdrawWithPenalty(0))
        .to.be.revertedWith("Penalty withdrawals are disabled");
    });

    it("Withdraw all if the amountToWithdraw is MaxUint256 when the account only has unlocked tokens", async () => {
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // check balance before withdraw
      let balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      let balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      let balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3));
      expect(balanceOfFeeReceiver).to.equal(0);

      // withdraw all
      const amountToWithdraw = await tokenLocker.connect(user1).callStatic.withdrawWithPenalty(ethers.constants.MaxUint256); // won't write state
      await tokenLocker.connect(user1).withdrawWithPenalty(ethers.constants.MaxUint256); // call to write state

      // check
      expect(amountToWithdraw).to.equal(ETHER.mul(3));
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);

      // check balance of user1 and tokenLocker
      // check balanceof user1 and tokenLock after withdraw
      balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE);
      expect(balanceOfTokenLocker).to.equal(0);
      expect(balanceOfFeeReceiver).to.be.equal(0);
    });

    it("Withdraw all if the amountToWithdraw is MaxUint256 when the account has unlocked and locked tokens", async () => {
      // jump to the 255th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 255));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // check balance before withdraw
      let balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      let balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      let balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3));
      expect(balanceOfFeeReceiver).to.equal(0);

      // expected withdrawn
      const [amount, penalty] = await tokenLocker.connect(user1).getWithdrawWithPenaltyAmounts(user1.getAddress(), 3);

      // withdraw all
      const amountToWithdraw = await tokenLocker.connect(user1).callStatic.withdrawWithPenalty(ethers.constants.MaxUint256); // won't write state
      await tokenLocker.connect(user1).withdrawWithPenalty(ethers.constants.MaxUint256); // call to write state

      // check
      expect(amountToWithdraw).to.be.equal(amount).to.be.equal(BigNumber.from("2634615384615384617"));
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);

      // check balance of user1 and tokenLocker
      // check balanceof user1 and tokenLock after withdraw
      balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)).add(amount));
      expect(balanceOfTokenLocker).to.equal(0);
      expect(balanceOfFeeReceiver).to.be.equal(penalty);
    });

    it("Withdraw without penalty if the amountToWithdraw is less than the unlocked", async () => {
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // check balance before withdraw
      let balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      let balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      let balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3));
      expect(balanceOfFeeReceiver).to.equal(0);

      // withdraw all
      const amountToWithdraw = await tokenLocker.connect(user1).callStatic.withdrawWithPenalty(3); // won't write state
      await tokenLocker.connect(user1).withdrawWithPenalty(3); // call to write state

      // check
      expect(amountToWithdraw).to.equal(ETHER.mul(3));
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);

      // check balance of user1 and tokenLocker
      // check balanceof user1 and tokenLock after withdraw
      balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE);
      expect(balanceOfTokenLocker).to.equal(0);
      expect(balanceOfFeeReceiver).to.be.equal(0);
    });

    it("Withdraw with penalty if the amountToWithdraw is greater than the unlocked", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // check balance before withdraw
      let balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      let balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      let balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3));
      expect(balanceOfFeeReceiver).to.equal(0);

      // expected withdrawn
      const [amount, penalty] = await tokenLocker.connect(user1).getWithdrawWithPenaltyAmounts(user1.getAddress(), 2);

      // withdraw all
      const amountToWithdraw = await tokenLocker.connect(user1).callStatic.withdrawWithPenalty(2); // won't write state
      await tokenLocker.connect(user1).withdrawWithPenalty(2); // call to write state

      // check
      expect(amountToWithdraw).to.be.equal(amount).to.be.equal(ETHER.mul(2));
      const accountData = await helper.getAccountData(user1);
      accountData
        .expectLockedEqual(0)
        .expectFrozenEqual(0)
        .expectUnlockedEqual(0);

      // check balance of user1 and tokenLocker
      // check balanceof user1 and tokenLock after withdraw
      balanceOfUser1 = await listaToken.balanceOf(user1.getAddress());
      balanceOfTokenLocker = await listaToken.balanceOf(tokenLocker.address);
      balanceOfFeeReceiver = await listaToken.balanceOf(feeReceiver.getAddress());
      expect(balanceOfUser1).to.equal(INIT_LISTA_TOKEN_BALANCE.sub(ETHER.mul(3)).add(amount));
      expect(balanceOfTokenLocker).to.equal(ETHER.mul(3).sub(amount).sub(penalty)); // 3 - 2 - 1 = 0
      expect(balanceOfFeeReceiver).to.be.equal(penalty);
    });

    it("Should revert if the account cannot pay the penalty", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));
      // update account data
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      // withdraw all
      await expect(tokenLocker.connect(user1).withdrawWithPenalty(3)).to.be.revertedWith("Insufficient balance after fees"); // call to write state
    });
  });

  describe("_weeklyWeightWrite(address)", async () => {
    const lockedDatas = [
      { amount: 1, weeks: 2, unlockWeek: 256 }, // lock 1 token for 2 weeks
      { amount: 2, weeks: 10, unlockWeek: 264 }, // lock 2 token for 10 weeks
    ]
    const week = 254;

    // init and check locked data
    beforeEach(async () => {
      // enabled penalty withdrawals
      const startAllowPenaltyWithdrawAfter = nextWeekDay(START_TIMESTAMP.toNumber(), (await ethers.provider.getBlock("latest")).timestamp, 0);
      await tokenLocker.connect(manager).setAllowPenaltyWithdrawAfter(startAllowPenaltyWithdrawAfter);
      // jump to startAllowPenaltyWithdrawAfter
      await time.increaseTo(startAllowPenaltyWithdrawAfter + 1);
      await tokenLocker.connect(owner).setPenaltyWithdrawalsEnabled(true);

      // jumpt 254th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 254));

      // check current week
      expect(await helper.getCurWeek()).to.equal(week);

      for (const lockedData of lockedDatas) {
        await tokenLocker.connect(user1).lock(user1.getAddress(), lockedData.amount, lockedData.weeks);
        expect(await helper.getNextNthWeek(lockedData.weeks)).to.equal(lockedData.unlockWeek);
      }
    });

    it("Return weight when the current week has updated", async () => {
      const weight = await tokenLocker.connect(user1).callStatic._weeklyWeightWriteInternal(user1.getAddress());

      // check
      expect(weight).to.equal(22); // 1 * 2 + 2 * 10
    });

    it("Return weight if the account is frozen", async () => {
      // freeze the account
      await helper.freeze(user1);
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));

      const weight = await tokenLocker.connect(user1).callStatic._weeklyWeightWriteInternal(user1.getAddress());

      // check
      expect(weight).to.be.equal(156); // 3 * 52
    });

    it("Return 0 if the account has no locked tokens", async () => {
      // jump to the 270th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 270));
      await tokenLocker.connect(user1).getAccountWeightWrite(user1.getAddress());

      const weight = await tokenLocker.connect(user1).callStatic._weeklyWeightWriteInternal(user1.getAddress());

      // check
      expect(weight).to.be.equal(0);
    });

    it("Return calculated weight if the account has locked tokens", async () => {
      // jump to the 260th week
      await time.increaseTo(getNthWeek(START_TIMESTAMP.toNumber(), 260));

      const weight = await tokenLocker.connect(user1).callStatic._weeklyWeightWriteInternal(user1.getAddress());

      // check
      expect(weight).to.be.equal(8); 2 * 4
    });
  });
});
