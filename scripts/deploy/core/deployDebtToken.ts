import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployDebtToken = async (
  listaCore: Contract,
  stabilityPool: Contract,
  borrowerOperations: Contract,
  factory: Contract
) => {
  console.log("Deploying DebtToken...");
  const debtToken = await ethers.deployContract("DebtToken", [
    params.debtTokenName,
    params.debtTokenSymbol,
    stabilityPool.address,
    borrowerOperations.address,
    listaCore.address,
    params.lzEndpoint,
    factory.address,
    params.gasPool,
    params.gasCompensation,
  ]);
  await debtToken.deployed();
  console.log("DebtToken deployed to:", debtToken.address);

  console.log("Updating debtToken in StabilityPool...");
  await stabilityPool.setDebtToken(debtToken.address);
  console.log("Updated debtToken in StabilityPool...");

  console.log("Updating debtToken in BorrowerOperations...");
  await borrowerOperations.setDebtToken(debtToken.address);
  console.log("Updated debtToken in BorrowerOperations...");

  console.log("Updating debtToken in Factory...");
  await factory.setDebtToken(debtToken.address);
  console.log("Updated debtToken in Factory...");

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: debtToken.address,
        constructorArguments: [
          params.debtTokenName,
          params.debtTokenSymbol,
          stabilityPool.address,
          borrowerOperations.address,
          listaCore.address,
          params.lzEndpoint,
          factory.address,
          params.gasPool,
          params.gasCompensation,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return debtToken;
};
