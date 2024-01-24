import hre, { ethers } from "hardhat";
import { Contract } from "ethers";
import { DEPLOYMENT_PARAMS } from "../../../../constants";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployMultiCollateralHintHelpers = async (borrowerOperations: Contract) => {
  console.log("Deploying MultiCollateralHintHelpers...");
  const multiCollateralHintHelpers = await ethers.deployContract("MultiCollateralHintHelpers", [
    borrowerOperations.target,
    params.gasCompensation,
  ]);
  await multiCollateralHintHelpers.waitForDeployment();
  console.log("MultiCollateralHintHelpers deployed to:", multiCollateralHintHelpers.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: multiCollateralHintHelpers.target,
        constructorArguments: [
          borrowerOperations.target,
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
