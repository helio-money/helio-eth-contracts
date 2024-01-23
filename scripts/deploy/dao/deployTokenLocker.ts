import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, ZeroAddress } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployTokenLocker = async (listaCore: Contract) => {
  console.log("Deploying TokenLocker...");
  const tokenLocker = await ethers.deployContract("TokenLocker", [
    listaCore.target,
    ZeroAddress,
    ZeroAddress,
    params.manager,
    params.lockToTokenRatio,
  ]);
  await tokenLocker.waitForDeployment();
  console.log("TokenLocker deployed to:", tokenLocker.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: tokenLocker.target,
        constructorArguments: [
          listaCore.address,
          ZeroAddress,
          ZeroAddress,
          params.manager,
          params.lockToTokenRatio,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return tokenLocker;
};
