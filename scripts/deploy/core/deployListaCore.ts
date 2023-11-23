import { DEPLOYMENT_PARAMS } from "../../../constants";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployListaCore = async () => {
  console.log("Deploying ListaCore...");

  const listaCore = await ethers.deployContract("ListaCore", [
    params.owner,
    params.guardian,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ]);
  await listaCore.deployed();
  console.log("ListaCore deployed to:", listaCore.address);

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: listaCore.address,
        constructorArguments: [
          params.owner,
          params.guardian,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return listaCore;
};
