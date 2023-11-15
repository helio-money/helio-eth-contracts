import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

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
  console.log(
    "BorrowerOperations deployed to:",
    await borrowerOperations.address
  );

  return borrowerOperations;
};
