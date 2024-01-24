import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, ZeroAddress } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployVault = async (
  listaCore: Contract,
  stabilityPool: Contract,
  tokenLocker: Contract,
  incentiveVoting: Contract
) => {
  console.log("Deploying ListaVault...");
  const vault = await ethers.deployContract("ListaVault", [
    listaCore.target,
    ZeroAddress,
    tokenLocker.target,
    incentiveVoting.target,
    stabilityPool.target,
    params.manager,
  ]);
  await vault.waitForDeployment();
  console.log("ListaVault deployed to:", vault.target);

  console.log("Updating ListaVault in StabilityPool...");
  await stabilityPool.setVault(vault.target);
  console.log("Updated ListaVault in StabilityPool...");

  console.log("Updating ListaVault in IncentiveVoting...");
  await incentiveVoting.setVault(vault.target);
  console.log("Updated ListaVault in IncentiveVoting...");

  while (true) {
    const updatedVaultAddress = await incentiveVoting.vault();
    if (updatedVaultAddress === vault.target) {
      console.log("Registering new receiver in Vault...");
      await vault.registerNewReceiver();
      console.log("Registered new receiver in Vault...");
      break;
    }
  }

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.target,
        constructorArguments: [
          listaCore.target,
          ZeroAddress,
          tokenLocker.target,
          incentiveVoting.target,
          stabilityPool.target,
          params.manager,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return vault;
};
