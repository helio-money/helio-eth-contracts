import { Contract } from "ethers";
import { ethers } from "hardhat";

export const deployStabilityPool = async (listaCore: Contract) => {
  console.log("Deploying StabilityPool...");
  const stabilityPool = await ethers.deployContract("StabilityPool", [
    listaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ]);
  await stabilityPool.deployed();
  console.log("StabilityPool deployed to:", await stabilityPool.address);

  return stabilityPool;
};
