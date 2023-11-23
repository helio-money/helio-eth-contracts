import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

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

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: stabilityPool.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return stabilityPool;
};
