import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployBorrowerOperations = async (listaCore: Contract) => {
  console.log("Deploying BorrowerOperations...");
  const borrowerOperations = await ethers.deployContract("BorrowerOperations", [
    listaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    params.minNetDebt,
    params.gasCompensation,
  ]);
  await borrowerOperations.deployed();
  console.log("BorrowerOperations deployed to:", borrowerOperations.address);

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: borrowerOperations.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          params.minNetDebt,
          params.gasCompensation,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return borrowerOperations;
};
