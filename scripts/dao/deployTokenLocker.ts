import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployTokenLocker = async (prismaCore: Contract) => {
  console.log("Deploying TokenLocker...");
  const tokenLocker = await ethers.deployContract("TokenLocker", [
    prismaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    params.manager,
    params.lockToTokenRatio,
  ]);
  await tokenLocker.waitForDeployment();
  console.log("TokenLocker deployed to:", await tokenLocker.address);

  return tokenLocker;
};
