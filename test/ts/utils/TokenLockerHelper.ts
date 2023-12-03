import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { MockInternalTokenLocker, } from "../../../typechain-types";
import { TokenLocker } from "../../../typechain-types/contracts/test/MockInternalTokenLocker";
import { getWeek } from "./time";

export class TokenLockerHelper {
  private readonly tokenLocker: MockInternalTokenLocker;
  public readonly startTimestamp: BigNumber;
  public readonly maxLockWeeks: BigNumber;

  constructor(
    tokenLocker: MockInternalTokenLocker,
    startTimestamp: BigNumber,
    maxLockWeeks: BigNumber
  ) {
    this.tokenLocker = tokenLocker;
    this.startTimestamp = startTimestamp;
    this.maxLockWeeks = maxLockWeeks;
  }

  public async getCurWeek(currentTimestamp?: number): Promise<number> {
    if (currentTimestamp === undefined) {
      currentTimestamp = Math.floor((await ethers.provider.getBlock("latest")).timestamp);
    }
    return getWeek(this.startTimestamp.toNumber(), currentTimestamp);
  }

  public async getNextNthWeek(n: number, currentTimestamp?: number): Promise<number> {
    if (currentTimestamp === undefined) {
      currentTimestamp = Math.floor((await ethers.provider.getBlock("latest")).timestamp);
    }
    return getWeek(this.startTimestamp.toNumber(), currentTimestamp) + n;
  }

  /**
   * Lock 1 token for 2 weeks and freeze all.
   * @param user 
   */
  public async lockAndFreeze(user: Signer) {
    await this.tokenLocker.connect(user).lock(user.getAddress(), 1, 2);
    await this.tokenLocker.connect(user).freeze();
  }

  /**
   * Freeze all.
   * @param user 
   */
  public async freeze(user: Signer) {
    await this.tokenLocker.connect(user).freeze();
  }

  public async getAccountData(user: Signer): Promise<AccountDataHelper> {
    const accountData = await this.tokenLocker.connect(user).getAccountLockData(user.getAddress());
    return new AccountDataHelper(accountData);
  }

  public async expectTotalDecayRateEqual(expected: number | BigNumber) {
    const decayRate = await this.tokenLocker.totalDecayRate();
    expect(decayRate).to.equal(expected);
  }

  public async expectTotalUpdatedWeekEqual(expected: number | BigNumber) {
    const updatedWeek = await this.tokenLocker.totalUpdatedWeek();
    expect(updatedWeek).to.equal(expected);
  }

  public async expectTotalWeeklyWeightsEqual(week: number | BigNumber, expected: number | BigNumber) {
    const weight = await this.tokenLocker.getTotalWeeklyWeight(week);
    expect(weight).to.equal(expected);
  }

  public async expectTotalWeeklyUnlocksEqual(week: number | BigNumber, expected: number | BigNumber) {
    const weight = await this.tokenLocker.getTotalWeeklyUnlocks(week);
    expect(weight).to.equal(expected);
  }

  public async expectAccountWeeklyWeightsEqual(user: Signer, week: number | BigNumber, expected: number | BigNumber) {
    const weight = await this.tokenLocker.getAccountWeeklyWeight(user.getAddress(), week);
    expect(weight).to.equal(expected);
  }

  public async expectAccountWeeklyUnlocksEqual(user: Signer, week: number | BigNumber, expected: number | BigNumber) {
    const weight = await this.tokenLocker.getAccountWeeklyUnlocks(user.getAddress(), week);
    expect(weight).to.equal(expected);
  }
}

export class AccountDataHelper {
  private accountLockData: TokenLocker.AccountDataStructOutput;

  constructor(accountLockData: TokenLocker.AccountDataStructOutput) {
    this.accountLockData = accountLockData;
  }

  public expectLockedEqual(locked: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.locked).to.equal(locked);
    return this;
  }

  public expectLockedNotEqual(unlocked: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.unlocked).to.not.equal(unlocked);
    return this;
  }

  public expectUnlockedEqual(unlocked: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.unlocked).to.equal(unlocked);
    return this;
  }

  public expectUnlockedNotEqual(locked: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.unlocked).to.not.equal(locked);
    return this;
  }

  public expectFrozenEqual(frozen: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.frozen).to.equal(frozen);
    return this;
  }

  public expectFrozenNotEqual(frozen: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.frozen).to.not.equal(frozen);
    return this;
  }

  public expectWeekEqual(week: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.week).to.equal(week);
    return this;
  }

  public expectWeekNotEqual(week: number | BigNumber): AccountDataHelper {
    expect(this.accountLockData.week).to.not.equal(week);
    return this;
  }

  public expectUpdateWeeksIsTrue(week: number | BigNumber): AccountDataHelper {
    expect(this.isWeekUpdated(this.toNumber(week))).to.equal(true);
    return this;
  }

  public expectUpdateWeeksIsFalse(week: number | BigNumber): AccountDataHelper {
    expect(this.isWeekUpdated(this.toNumber(week))).to.equal(false);
    return this;
  }

  private toNumber(value: number | BigNumber): number {
    return typeof value === "number" ? value : value.toNumber();
  }

  private isWeekUpdated(week: number): boolean {
    const idx = Math.floor(week / 256);
    const bitfield = this.accountLockData.updateWeeks[idx].toNumber();
    const isUpdated = (bitfield & (1 << (week % 256))) > 0;
    return isUpdated;
  }
}
