import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployVault = async (
  prismaCore: Contract,
  stabilityPool: Contract,
  tokenLocker: Contract
) => {
  console.log("Deploying PrismaVault...");
  const vault = await ethers.deployContract("PrismaVault", [
    prismaCore.address,
    ethers.constants.AddressZero,
    tokenLocker.address,
    ethers.constants.AddressZero,
    stabilityPool.address,
    params.manager,
  ]);
  await vault.waitForDeployment();
  console.log("PrismaVault deployed to:", await vault.address);

  console.log("Updating PrismaVault in StabilityPool...");
  await stabilityPool.setVault(vault.address);
  console.log("Updated PrismaVault in StabilityPool...");

  return vault;
};
