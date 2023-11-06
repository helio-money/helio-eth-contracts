import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployPrismaFeed = async (prismaCore: Contract) => {
  console.log("Deploying PrismaFeed...");
  const prismaFeed = await ethers.deployContract("PrismaFeed", [
    prismaCore.address,
    params.ethFeed,
  ]);
  await prismaFeed.waitForDeployment();
  console.log("PrismaFeed deployed to:", await prismaFeed.address);

  console.log("Updating priceFeed in PrismaCore...");
  await prismaCore.setPriceFeed(prismaFeed.address);
  console.log("Updated priceFeed in PrismaCore.");

  return prismaFeed;
};
