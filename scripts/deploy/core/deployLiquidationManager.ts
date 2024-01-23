import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployLiquidationManager = async (
  stabilityPool: Contract,
  borrowerOperations: Contract,
  factory: Contract
) => {
  console.log("Deploying LiquidationManager...");
  const LiquidationManager = await ethers.getContractFactory("LiquidationManager");
  const liquidationManager = await upgrades.deployProxy(LiquidationManager, [
    stabilityPool.target,
    borrowerOperations.target,
    factory.target,
    params.gasCompensation,
  ]);

  console.log(
    "LiquidationManager deployed to:", liquidationManager.target
  );

  console.log("Updating liquidationManager in StabilityPool...");
  await stabilityPool.setLiquidationManager(liquidationManager.target);
  console.log("Updated liquidationManager in StabilityPool...");

  console.log("Updating liquidationManager in Factory...");
  await factory.setLiquidationManager(liquidationManager.target);
  console.log("Updated liquidationManager in Factory...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: liquidationManager.target,
        constructorArguments: [
          stabilityPool.target,
          borrowerOperations.target,
          factory.target,
          params.gasCompensation,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return liquidationManager;
};
