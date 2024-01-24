import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, Signer } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployTroveManager = async (
  listaCore: Contract,
  debtToken: Contract,
  borrowOperations: Contract,
  liquidationManager: Contract,
  vault: Contract,
  factory: Contract
) => {
  console.log("Deploying TroveManager...");
  const TroveManager = await ethers.getContractFactory("TroveManager");
  const troveManager = await upgrades.deployProxy(TroveManager, [
    listaCore.target,
    params.gasPool,
    debtToken.target,
    borrowOperations.target,
    vault.target,
    factory.target,
    liquidationManager.target,
    params.gasCompensation
  ], { unsafeAllow: ['constructor'] });
  await troveManager.waitForDeployment();
  console.log("TroveManager deployed to:", troveManager.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: troveManager.target,
        constructorArguments: [
          listaCore.target,
          params.gasPool,
          debtToken.target,
          borrowOperations.target,
          vault.target,
          factory.target,
          liquidationManager.target,
          params.gasCompensation
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return troveManager;
};
