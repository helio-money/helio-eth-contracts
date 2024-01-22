import { deployCollateralToken } from "../test/deployCollateralToken";
import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, Signer } from "ethers";
import hre, { ethers, upgrades } from "hardhat";
import { ZERO_ADDRESS } from "../../../test/ts/utils";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployBorrowerOperations = async (listaCore: Contract, wBETH: string) => {
  console.log("Deploying BorrowerOperations...");

  const BorrowerOperations = await ethers.getContractFactory("BorrowerOperations");
  const borrowerOperations = await upgrades.deployProxy(BorrowerOperations, [
    listaCore.address,
    wBETH, // wbeth
    params.referral, // referral
    ZERO_ADDRESS, //debtToken.address
    ZERO_ADDRESS, // factory
    params.minNetDebt, // minNetDebt
    params.gasCompensation, // gasCompensation
  ]);

  console.log("BorrowerOperations deployed to:", borrowerOperations.address);


  while (hre.network.name !== "hardhat") {
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
