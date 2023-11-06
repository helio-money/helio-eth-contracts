import { Contract } from "ethers";
import { ethers } from "hardhat";

export const deployStabilityPool = async (prismaCore: Contract) => {
  console.log("Deploying StabilityPool...");
  const stabilityPool = await ethers.deployContract("StabilityPool", [
    prismaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ]);
  await stabilityPool.waitForDeployment();
  console.log("StabilityPool deployed to:", await stabilityPool.address);

  return stabilityPool;
};
