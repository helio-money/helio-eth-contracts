import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployBorrowerOperations = async (prismaCore: Contract) => {
  console.log("Deploying BorrowerOperations...");
  const borrowerOperations = await ethers.deployContract("BorrowerOperations", [
    prismaCore.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    params.minNetDebt,
    params.gasCompensation,
  ]);
  await borrowerOperations.waitForDeployment();
  console.log(
    "BorrowerOperations deployed to:",
    await borrowerOperations.address
  );

  return borrowerOperations;
};
