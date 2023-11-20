import { DEPLOYMENT_PARAMS } from "../../constants";
import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];
const addresses = DEPLOYED_ADDRESSES[11155111];

export const deployTroveManager = async () => {
  console.log("Deploying TroveManager...");
  const troveManager = await ethers.deployContract("TroveManager", [
    addresses.ListaCore,
    params.gasPool,
    addresses.DebtToken,
    addresses.BorrowOperations,
    addresses.Vault,
    addresses.LiquidationManager,
    params.gasCompensation,
  ]);
  await troveManager.deployed();
  console.log("TroveManager deployed to:", troveManager.address);

  await hre.run("verify:verify", {
    address: troveManager.address,
    constructorArguments: [
      addresses.ListaCore,
      params.gasPool,
      addresses.DebtToken,
      addresses.BorrowOperations,
      addresses.Vault,
      addresses.LiquidationManager,
      params.gasCompensation,
    ],
  });

  return troveManager;
};
