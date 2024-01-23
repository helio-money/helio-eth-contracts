import { deployCollateralToken } from "../test/deployCollateralToken";
import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, Signer, ZeroAddress } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployBorrowerOperations = async (listaCore: Contract, wBETH: string) => {
  console.log("Deploying BorrowerOperations...");

  const BorrowerOperations = await ethers.getContractFactory("BorrowerOperations");
  const borrowerOperations = await upgrades.deployProxy(BorrowerOperations, [
    listaCore.target,
    wBETH, // wbeth
    params.referral, // referral
    ZeroAddress, //debtToken.address
    ZeroAddress, // factory
    params.minNetDebt, // minNetDebt
    params.gasCompensation, // gasCompensation
  ]);

  console.log("BorrowerOperations deployed to:", borrowerOperations.target);


  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: borrowerOperations.target,
        constructorArguments: [
          listaCore.target,
          params.wBETH, // wbeth
          params.referral, // referral
          ZeroAddress, //debtToken.address
          ZeroAddress, // factory
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
