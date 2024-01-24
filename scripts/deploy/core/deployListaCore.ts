import { DEPLOYMENT_PARAMS } from "../../../constants";
import hre, { ethers } from "hardhat";
import { Signer, ZeroAddress } from "ethers";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployListaCore = async (owner: Signer) => {
  console.log("Deploying ListaCore...");

  const listaCore = await ethers.deployContract("ListaCore", [
    await owner.getAddress(), // owner
    params.guardian,
    ZeroAddress, // priceFeed
    ZeroAddress // feeReceiver
  ]);
  await listaCore.waitForDeployment();
  console.log("ListaCore deployed to:", await listaCore.getAddress());

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: listaCore.target,
        constructorArguments: [
          await owner.getAddress(), // owner
          params.guardian,
          ZeroAddress, // priceFeed
          ZeroAddress // feeReceiver
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return listaCore;
};
