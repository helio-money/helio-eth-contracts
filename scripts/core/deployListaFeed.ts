import { DEPLOYMENT_PARAMS } from "../../constants";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[1];

export const deployListaFeed = async (listaCore: Contract) => {
  console.log("Deploying ListaFeed...");
  const listaFeed = await ethers.deployContract("ListaFeed", [
    listaCore.address,
    params.ethFeed,
  ]);
  await listaFeed.waitForDeployment();
  console.log("ListaFeed deployed to:", await listaFeed.address);

  console.log("Updating priceFeed in ListaCore...");
  await listaCore.setPriceFeed(listaFeed.address);
  console.log("Updated priceFeed in ListaCore.");

  return listaFeed;
};
