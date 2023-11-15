import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployLiquidationManager = async (
  stabilityPool: Contract,
  borrowerOperations: Contract,
  factory: Contract
) => {
  console.log("Deploying LiquidationManager...");
  const liquidationManager = await ethers.deployContract("LiquidationManager", [
    stabilityPool.address,
    borrowerOperations.address,
    factory.address,
    params.gasCompensation,
  ]);
  await liquidationManager.deployed();
  console.log(
    "LiquidationManager deployed to:",
    await liquidationManager.address
  );

  console.log("Updating liquidationManager in StabilityPool...");
  await stabilityPool.setLiquidationManager(liquidationManager.address);
  console.log("Updated liquidationManager in StabilityPool...");

  console.log("Updating liquidationManager in Factory...");
  await factory.setLiquidationManager(liquidationManager.address);
  console.log("Updated liquidationManager in Factory...");

  return liquidationManager;
};
