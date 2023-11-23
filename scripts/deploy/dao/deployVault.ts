import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
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
    listaCore.address,
    ethers.constants.AddressZero,
    tokenLocker.address,
    incentiveVoting.address,
    stabilityPool.address,
    params.manager,
  ]);
  await vault.deployed();
  console.log("ListaVault deployed to:", await vault.address);

  console.log("Updating ListaVault in StabilityPool...");
  await stabilityPool.setVault(vault.address);
  console.log("Updated ListaVault in StabilityPool...");

  console.log("Updating ListaVault in IncentiveVoting...");
  await incentiveVoting.setVault(vault.address);
  console.log("Updated ListaVault in IncentiveVoting...");

  while (true) {
    const updatedVaultAddress = await incentiveVoting.vault();
    if (updatedVaultAddress === vault.address) {
      console.log("Registering new receiver in Vault...");
      await vault.registerNewReceiver();
      console.log("Registered new receiver in Vault...");
      break;
    }
  }

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero,
          tokenLocker.address,
          incentiveVoting.address,
          stabilityPool.address,
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
