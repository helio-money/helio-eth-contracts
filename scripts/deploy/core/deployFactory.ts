import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployFactory = async (
  listaCore: Contract,
  stabilityPool: Contract,
  borrowerOperations: Contract
) => {
  console.log("Deploying Factory...");
  const factory = await ethers.deployContract("Factory", [
    listaCore.address,
    ethers.constants.AddressZero,
    stabilityPool.address,
    borrowerOperations.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ]);
  await factory.deployed();
  console.log("Factory deployed to:", await factory.address);

  console.log("Updating factory in StabilityPool...");
  await stabilityPool.setFactory(factory.address);
  console.log("Updated factory in StabilityPool...");

  console.log("Updating factory in BorrowerOperations...");
  await borrowerOperations.setFactory(factory.address);
  console.log("Updated factory in BorrowerOperations...");

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero,
          stabilityPool.address,
          borrowerOperations.address,
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

  return factory;
};
