import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployDebtToken = async (
  prismaCore: Contract,
  stabilityPool: Contract,
  borrowerOperations: Contract,
  factory: Contract
) => {
  console.log("Deploying DebtToken...");
  const debtToken = await ethers.deployContract("DebtToken", [
    params.debtTokenName,
    params.debtTokenSymbol,
    stabilityPool.address,
    borrowerOperations.address,
    prismaCore.address,
    params.lzEndpoint,
    factory.address,
    params.gasPool,
    params.gasCompensation,
  ]);
  await debtToken.waitForDeployment();
  console.log("DebtToken deployed to:", await debtToken.address);

  console.log("Updating debtToken in StabilityPool...");
  await stabilityPool.setDebtToken(debtToken.address);
  console.log("Updated debtToken in StabilityPool...");

  console.log("Updating debtToken in BorrowerOperations...");
  await borrowerOperations.setDebtToken(debtToken.address);
  console.log("Updated debtToken in BorrowerOperations...");

  console.log("Updating debtToken in Factory...");
  await factory.setDebtToken(debtToken.address);
  console.log("Updated debtToken in Factory...");

  return debtToken;
};
