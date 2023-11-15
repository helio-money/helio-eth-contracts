import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

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

  console.log("Registering new receiver in Vault...");
  await vault.registerNewReceiver();
  console.log("Registered new receiver in Vault...");

  return vault;
};