import hre, { ethers } from "hardhat";
import { Contract } from "ethers";
import { DEPLOYMENT_PARAMS } from "../../../../constants";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployMultiCollateralHintHelpers = async (borrowerOperations: Contract) => {
  console.log("Deploying MultiCollateralHintHelpers...");
  const multiCollateralHintHelpers = await ethers.deployContract("MultiCollateralHintHelpers", [
    borrowerOperations.address,
    params.gasCompensation,
  ]);
  await multiCollateralHintHelpers.deployed();
  console.log("MultiCollateralHintHelpers deployed to:", multiCollateralHintHelpers.address);

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: multiCollateralHintHelpers.address,
        constructorArguments: [
          borrowerOperations.address,
          params.gasCompensation,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return multiCollateralHintHelpers;
};
