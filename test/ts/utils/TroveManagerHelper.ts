import { BigNumber } from "ethers";
import { _1E18, DAY, WEEK, YEAR, ZERO } from "./constant";
import { ethers } from "hardhat";
import { abi } from "./contract";
import { InternalTroveManager } from "../../../typechain-types";
import { now } from "./time";
import { computeCR } from "./math";

export const INTEREST_PRECISION = BigNumber.from("10").pow(27);
export const SUNSETTING_INTEREST_RATE = INTEREST_PRECISION.mul(5000).div(YEAR * 10000);
export const BETA = 2;
export const VOLUME_MULTIPLIER = BigNumber.from("10").pow(20);
export const CCR = BigNumber.from("1500000000000000000");
export const MAX_INTEREST_RATE_IN_BPS = 400;
export const Status = {
  nonExistent: 0,
  active: 1,
  closedByOwner: 2,
  closedByLiquidation: 3,
  closedByRedemption: 4,
}

export async function addTrove(
  troveManager: InternalTroveManager,
  account: string,
  trove: {
    coll: BigNumber | number,
    debt: BigNumber | number,
    stake: BigNumber | number,
    status: number,
    arrayIndex: number,
    activeInterestIndex: BigNumber | number
  }
) {
  await troveManager.setTrove(account, trove.coll, trove.debt, trove.stake, trove.status, trove.arrayIndex, trove.activeInterestIndex);
}

export function getPendingCollAndDebtRewards(
  troveStake: BigNumber,
  snapshot: {
    collateral: BigNumber;
    debt: BigNumber
  },
  L_coll: BigNumber,
  L_debt: BigNumber
): {
  pendingColl: BigNumber,
  pendingDebt: BigNumber
} {
  const deltaColl = L_coll.sub(snapshot.collateral);
  const deltaDebt = L_debt.sub(snapshot.debt);
  if (deltaColl.add(deltaDebt).eq(0)) {
    return {
      pendingColl: ZERO,
      pendingDebt: ZERO
    };
  }

  return {
    pendingColl: troveStake.mul(deltaColl).div(_1E18),
    pendingDebt: troveStake.mul(deltaDebt).div(_1E18),
  };
}

export function getWeekAndDay(duration: BigNumber | number) {
  return {
    week: BigNumber.from(duration).div(WEEK),
    day: BigNumber.from(duration).mod(WEEK).div(DAY)
  };
}

export function computeStake(coll: BigNumber, totalCollSnapshot: BigNumber, totalStakeSnapshot: BigNumber) {
  if (totalStakeSnapshot.eq(0)) {
    return coll;
  }
  return coll.mul(totalStakeSnapshot).div(totalCollSnapshot);
}

export async function internalTotalActiveDebt(troveManager: InternalTroveManager) {
  const data = await ethers.provider.getStorageAt(troveManager.address, 27);
  return BigNumber.from(abi.decode(["uint256"], data)[0]);
}

export async function internalTotalActiveCollateral(troveManager: InternalTroveManager) {
  const data = await ethers.provider.getStorageAt(troveManager.address, 26);
  return BigNumber.from(abi.decode(["uint256"], data)[0]);
}

export async function calculateInterestIndex(troveManager: InternalTroveManager, lastIndexUpdateTime: BigNumber | number, interestRate: BigNumber, nowTimestamp: BigNumber | number) {
  const result = { currentInterestIndex: ZERO, interestFactor: ZERO };
  if (BigNumber.from(lastIndexUpdateTime).eq(nowTimestamp)) {
    result.currentInterestIndex = await troveManager.activeInterestIndex();
    return result;
  }

  result.currentInterestIndex = await troveManager.activeInterestIndex();
  if (interestRate.gt(0)) {
    const deltaTime = BigNumber.from(nowTimestamp).sub(lastIndexUpdateTime);
    result.interestFactor = deltaTime.mul(interestRate);
    result.currentInterestIndex = result.currentInterestIndex.mul(INTEREST_PRECISION.add(result.interestFactor)).div(INTEREST_PRECISION);
  }

  return result;
}

export async function accrueActiveInterests(troveManager: InternalTroveManager, lastIndexUpdateTime: BigNumber, interestRate: BigNumber, nowTimestamp: BigNumber) {
  let {
    currentInterestIndex,
    interestFactor
  } = await calculateInterestIndex(troveManager, lastIndexUpdateTime, interestRate, nowTimestamp);

  let interest = ZERO;
  let totalDebt = await internalTotalActiveDebt(troveManager);
  if (interestFactor.gt(0)) {
    interest = totalDebt.mul(interestFactor).div(INTEREST_PRECISION);
  }
  return {
    currentInterestIndex,
    interestFactor,
    totalActiveDebt: totalDebt.add(interest),
    interestPayable: interest.add(await troveManager.interestPayable()),
    activeInterestIndex: currentInterestIndex,
    lastActiveIndexUpdate: BigNumber.from(await now()),
  };
}

export async function getCurrentICR(troveManager: InternalTroveManager, borrower: string, price: BigNumber) {
  const { debt, coll } = await getTroveCollAndDebt(troveManager, borrower);
  return computeCR(coll, debt, price);
}

export async function getTroveCollAndDebt(troveManager: InternalTroveManager, borrower: string) {
  return await getEntireDebtAndColl(troveManager, borrower);
}

export async function getEntireDebtAndColl(troveManager: InternalTroveManager, borrower: string) {
  const trove = await troveManager.Troves(borrower);
  const snapshot = await troveManager.rewardSnapshots(borrower);
  const data = getPendingCollAndDebtRewards(trove.stake, snapshot, await troveManager.L_collateral(), await troveManager.L_debt());
  let debt = trove.debt;
  let coll = trove.coll;
  if (trove.activeInterestIndex.gt(0)) {
    const interestInfo = await calculateInterestIndex(troveManager, await troveManager.lastActiveIndexUpdate(), await troveManager.interestRate(), await now());
    debt = debt.mul(interestInfo.currentInterestIndex).div(trove.activeInterestIndex);
  }

  return {
    pendingCollateralReward: data.pendingColl,
    pendingDebtReward: data.pendingDebt,
    debt: debt.add(data.pendingDebt),
    coll: coll.add(data.pendingColl),
  };
}

export async function getStoredPendingReward(troveManager: InternalTroveManager, account: string) {
  const key = ethers.utils.solidityKeccak256(["uint256", "uint256"], [account, 34])
  const data = await ethers.provider.getStorageAt(troveManager.address, key);
  return abi.decode(["uint256"], data)[0];
}
