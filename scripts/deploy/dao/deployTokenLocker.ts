import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployTokenLocker = async (listaCore: Contract) => {
  console.log("Deploying TokenLocker...");
  const tokenLocker = await ethers.deployContract("TokenLocker", [
    listaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    params.manager,
    params.lockToTokenRatio,
  ]);
  await tokenLocker.deployed();
  console.log("TokenLocker deployed to:", tokenLocker.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: tokenLocker.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
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
