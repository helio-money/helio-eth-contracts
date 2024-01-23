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
    stabilityPool.target,
    borrowerOperations.target,
    listaCore.target,
    params.lzEndpoint,
    factory.target,
    params.gasPool,
    params.gasCompensation,
  ]);
  await debtToken.waitForDeployment();
  console.log("DebtToken deployed to:", debtToken.target);

  console.log("Updating debtToken in StabilityPool...");
  await stabilityPool.setDebtToken(debtToken.target);
  console.log("Updated debtToken in StabilityPool...");

  console.log("Updating debtToken in BorrowerOperations...");
  await borrowerOperations.setDebtToken(debtToken.target);
  console.log("Updated debtToken in BorrowerOperations...");

  console.log("Updating debtToken in Factory...");
  await factory.setDebtToken(debtToken.target);
  console.log("Updated debtToken in Factory...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: debtToken.target,
        constructorArguments: [
          params.debtTokenName,
          params.debtTokenSymbol,
          stabilityPool.target,
          borrowerOperations.target,
          listaCore.target,
          params.lzEndpoint,
          factory.target,
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
