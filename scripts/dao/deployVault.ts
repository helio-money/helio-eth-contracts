import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployVault = async (
  listaCore: Contract,
  stabilityPool: Contract,
  tokenLocker: Contract
) => {
  console.log("Deploying ListaVault...");
  const vault = await ethers.deployContract("ListaVault", [
    listaCore.address,
    ethers.constants.AddressZero,
    tokenLocker.address,
    ethers.constants.AddressZero,
    stabilityPool.address,
    params.manager,
  ]);
  await vault.waitForDeployment();
  console.log("ListaVault deployed to:", await vault.address);

  console.log("Updating ListaVault in StabilityPool...");
  await stabilityPool.setVault(vault.address);
  console.log("Updated ListaVault in StabilityPool...");

  return vault;
};
