import { DEPLOYMENT_PARAMS } from "../../constants";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployListaCore = async () => {
  console.log("Deploying ListaCore...");
  const listaCore = await ethers.deployContract("ListaCore", [
    params.owner,
    params.guardian,
    ethers.constants.AddressZero,
    params.feeReceiver,
  ]);
  await listaCore.waitForDeployment();
  console.log("ListaCore deployed to:", listaCore.address);

  return listaCore;
};
