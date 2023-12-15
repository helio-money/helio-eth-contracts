import { BigNumber } from "ethers";
import { ZERO } from "./constant";
import { MockTroveManager } from "../../../typechain-types";
import { parseEther } from "ethers/lib/utils";
import { abi } from "./contract";
import { ethers } from "hardhat";
import { min } from "./math";

export const gasCompensation = parseEther("200");
export const PERCENT_DIVISOR = 200;

function getOffsetAndRedistributionVals(debt: BigNumber, coll: BigNumber, debtInSP: BigNumber, sunsetting: boolean) {
  let result = {
    debtToOffset: ZERO,
    collToSendToSP: ZERO,
    debtToRedistribute: ZERO,
    collToRedistribute: ZERO,
  };

  if (debtInSP.gt(0) && !sunsetting) {
    const debtToOffset = min(debt, debtInSP);
    const collToSendToSP = coll.mul(debtToOffset).div(debt);

    result.debtToOffset = debtToOffset;
    result.collToSendToSP = collToSendToSP;
    result.debtToRedistribute = debt.sub(debtToOffset);
    result.collToRedistribute = coll.sub(collToSendToSP);
  } else {
    result.debtToRedistribute = debt;
    result.collToRedistribute = coll;
  }

  return result;
}

export async function liquidateNormalMode(troveManager: MockTroveManager, borrower: string, debtInSP: BigNumber, sunsetting: boolean) {
  const entireTrove = await troveManager.getEntireDebtAndColl(borrower);
  let singleLiquidation = initSingleLiquidationParam();

  singleLiquidation.entireTroveDebt = entireTrove.debt;
  singleLiquidation.entireTroveColl = entireTrove.coll;
  singleLiquidation.collGasCompensation = entireTrove.coll.div(PERCENT_DIVISOR);
  singleLiquidation.debtGasCompensation = gasCompensation;
  const result = getOffsetAndRedistributionVals(
    singleLiquidation.entireTroveDebt,
    singleLiquidation.entireTroveColl.sub(singleLiquidation.collGasCompensation),
    debtInSP,
    sunsetting
  );
  singleLiquidation.debtToOffset = result.debtToOffset;
  singleLiquidation.collToSendToSP = result.collToSendToSP;
  singleLiquidation.debtToRedistribute = result.debtToRedistribute;
  singleLiquidation.collToRedistribute = result.collToRedistribute;
  return singleLiquidation;
}

export async function liquidateWithoutSP(troveManager: MockTroveManager, borrower: string) {
  const entireTrove = await troveManager.getEntireDebtAndColl(borrower);
  let result = {
    entireTroveDebt: ZERO,
    entireTroveColl: ZERO,
    collGasCompensation: ZERO,
    debtGasCompensation: ZERO,
    debtToOffset: ZERO,
    collToSendToSP: ZERO,
    debtToRedistribute: ZERO,
    collToRedistribute: ZERO,
    collSurplus: ZERO
  };

  result.entireTroveDebt = entireTrove.debt;
  result.entireTroveColl = entireTrove.coll;
  result.collGasCompensation = entireTrove.coll.div(PERCENT_DIVISOR);
  result.debtGasCompensation = gasCompensation;
  result.debtToOffset = ZERO;
  result.collToSendToSP = ZERO;
  result.debtToRedistribute = entireTrove.debt;
  result.collToRedistribute = entireTrove.coll.sub(result.collGasCompensation);
  return result;
}

export async function tryLiquidateWithCap(troveManager: MockTroveManager, borrower: string, debtInSP: BigNumber, MCR: BigNumber, price: BigNumber) {
  const entireTrove = await troveManager.getEntireDebtAndColl(borrower);
  let result = {
    entireTroveDebt: ZERO,
    entireTroveColl: ZERO,
    collGasCompensation: ZERO,
    debtGasCompensation: ZERO,
    debtToOffset: ZERO,
    collToSendToSP: ZERO,
    debtToRedistribute: ZERO,
    collToRedistribute: ZERO,
    collSurplus: ZERO
  };
  if (entireTrove.debt.gt(debtInSP)) {
    return result;
  }

  result.entireTroveDebt = entireTrove.debt;
  result.entireTroveColl = entireTrove.coll;
  const collToOffset = entireTrove.debt.mul(MCR).div(price);
  result.collGasCompensation = collToOffset.div(PERCENT_DIVISOR);
  result.debtGasCompensation = gasCompensation;
  result.debtToOffset = entireTrove.debt;
  result.collToSendToSP = collToOffset.sub(result.collGasCompensation);
  const collSurplus = entireTrove.coll.sub(collToOffset);
  if (collSurplus.gt(0)) {
    result.collSurplus = collSurplus;
  }

  return result;
}

export function initTotalsParam() {
  return {
    totalCollInSequence: ZERO,
    totalDebtInSequence: ZERO,
    totalCollGasCompensation: ZERO,
    totalDebtGasCompensation: ZERO,
    totalDebtToOffset: ZERO,
    totalCollToSendToSP: ZERO,
    totalDebtToRedistribute: ZERO,
    totalCollToRedistribute: ZERO,
    totalCollSurplus: ZERO,
  };
}

export function initSingleLiquidationParam() {
  return {
    entireTroveDebt: ZERO,
    entireTroveColl: ZERO,
    collGasCompensation: ZERO,
    debtGasCompensation: ZERO,
    debtToOffset: ZERO,
    collToSendToSP: ZERO,
    debtToRedistribute: ZERO,
    collToRedistribute: ZERO,
    collSurplus: ZERO,
  };
}

export function applyLiquidationValuesToTotals(totals: {
  totalCollInSequence: BigNumber,
  totalDebtInSequence: BigNumber,
  totalCollGasCompensation: BigNumber,
  totalDebtGasCompensation: BigNumber,
  totalDebtToOffset: BigNumber,
  totalCollToSendToSP: BigNumber,
  totalDebtToRedistribute: BigNumber,
  totalCollToRedistribute: BigNumber,
  totalCollSurplus: BigNumber,
}, singleLiquidation: {
  entireTroveDebt: BigNumber,
  entireTroveColl: BigNumber,
  collGasCompensation: BigNumber,
  debtGasCompensation: BigNumber,
  debtToOffset: BigNumber,
  collToSendToSP: BigNumber,
  debtToRedistribute: BigNumber,
  collToRedistribute: BigNumber,
  collSurplus: BigNumber,
}) {
  totals.totalCollGasCompensation = totals.totalCollGasCompensation.add(singleLiquidation.collGasCompensation);
  totals.totalDebtGasCompensation = totals.totalDebtGasCompensation.add(singleLiquidation.debtGasCompensation);
  totals.totalDebtInSequence = totals.totalDebtInSequence.add(singleLiquidation.entireTroveDebt);
  totals.totalCollInSequence = totals.totalCollInSequence.add(singleLiquidation.entireTroveColl);
  totals.totalDebtToOffset = totals.totalDebtToOffset.add(singleLiquidation.debtToOffset);
  totals.totalCollToSendToSP = totals.totalCollToSendToSP.add(singleLiquidation.collToSendToSP);
  totals.totalDebtToRedistribute = totals.totalDebtToRedistribute.add(singleLiquidation.debtToRedistribute);
  totals.totalCollToRedistribute = totals.totalCollToRedistribute.add(singleLiquidation.collToRedistribute);
  totals.totalCollSurplus = totals.totalCollSurplus.add(singleLiquidation.collSurplus);
}

export async function isTroveManagerEnabled(liquidationManager: string, addr: string) {
  let pos = ethers.utils.solidityKeccak256(["uint256", "uint256"], [addr, 0]);
  let data = await ethers.provider.getStorageAt(liquidationManager, pos);
  return abi.decode(["bool"], data)[0];
}
