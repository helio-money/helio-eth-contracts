import { Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { DEPLOYMENT_PARAMS } from "../../../constants";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployStabilityPool = async (listaCore: Contract) => {
  console.log("Deploying StabilityPool...");
  const stabilityPool = await ethers.deployContract("StabilityPool", [
    listaCore.address,
    ethers.constants.AddressZero, // debtToken
    params.vault, // vault
    ethers.constants.AddressZero, // factory
    ethers.constants.AddressZero, // liquidationManager
  ]);
  await stabilityPool.deployed();
  console.log("StabilityPool deployed to:", stabilityPool.address);

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: stabilityPool.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero, // debtToken
          params.vault, // vault
          ethers.constants.AddressZero, // factory
          ethers.constants.AddressZero, // liquidationManager
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return stabilityPool;
};
