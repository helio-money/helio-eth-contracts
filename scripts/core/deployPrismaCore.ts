import { DEPLOYMENT_PARAMS } from "../../constants";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployPrismaCore = async () => {
  console.log("Deploying PrismaCore...");
  const prismaCore = await ethers.deployContract("PrismaCore", [
    params.owner,
    params.guardian,
    ethers.constants.AddressZero,
    params.feeReceiver,
  ]);
  await prismaCore.waitForDeployment();
  console.log("PrismaCore deployed to:", prismaCore.address);

  return prismaCore;
};
