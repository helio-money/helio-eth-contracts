import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, Signer } from "ethers";
import hre, { ethers } from "hardhat";
import { ZERO_ADDRESS } from "../../../test/ts/utils";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployBorrowerOperations = async (listaCore: Contract) => {
  console.log("Deploying BorrowerOperations...");
  const borrowerOperations = await ethers.deployContract("BorrowerOperations", [
    listaCore.address,
    params.wBETH, // wbeth
    params.referral, // referral
    ZERO_ADDRESS, //debtToken.address
    ZERO_ADDRESS, // factory
    params.minNetDebt, // minNetDebt
    params.gasCompensation, // gasCompensation
  ]);
  await borrowerOperations.deployed();
  console.log("BorrowerOperations deployed to:", borrowerOperations.address);


  const v = true;
  while (v) {
    try {
      await hre.run("verify:verify", {
        address: borrowerOperations.address,
        constructorArguments: [
          listaCore.address,
          params.wBETH, // wbeth
          params.referral, // referral
          ZERO_ADDRESS, //debtToken.address
          ZERO_ADDRESS, // factory
          params.minNetDebt, // minNetDebt
          params.gasCompensation, // gasCompensation
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }
  return borrowerOperations;
};
