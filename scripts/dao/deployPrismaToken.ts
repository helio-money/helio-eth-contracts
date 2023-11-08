import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployPrismaToken = async (
  vault: Contract,
  tokenLocker: Contract
) => {
  console.log("Deploying PrismaToken...");
  const prismaToken = await ethers.deployContract("PrismaToken", [
    vault.address,
    params.lzEndpoint,
    tokenLocker.address,
  ]);
  await prismaToken.waitForDeployment();
  console.log("PrismaToken deployed to:", await prismaToken.address);

  return prismaToken;
};
