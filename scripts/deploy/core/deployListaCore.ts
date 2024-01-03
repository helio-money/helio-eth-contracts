import { DEPLOYMENT_PARAMS } from "../../../constants";
import hre, { ethers } from "hardhat";
import { Signer } from "ethers";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployListaCore = async (owner: Signer) => {
  console.log("Deploying ListaCore...");

  const listaCore = await ethers.deployContract("ListaCore", [
    await owner.getAddress(), // owner
    params.guardian,
    ethers.constants.AddressZero, // priceFeed
    params.feeReceiver // feeReceiver
  ]);
  await listaCore.deployed();
  console.log("ListaCore deployed to:", listaCore.address);

  const v = true;
  while (v) {
    try {
      await hre.run("verify:verify", {
        address: listaCore.address,
        constructorArguments: [
          await owner.getAddress(), // owner
          params.guardian,
          ethers.constants.AddressZero, // priceFeed
          params.feeReceiver, // feeReceiver
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return listaCore;
};
