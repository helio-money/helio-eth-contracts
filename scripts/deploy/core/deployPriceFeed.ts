import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployPriceFeed = async (listaCore: Contract) => {
  console.log("Deploying PriceFeed...");
  const priceFeed = await ethers.deployContract("PriceFeed", [
    listaCore.address,
    params.ethFeed,
  ]);
  await priceFeed.deployed();
  console.log("ListaFeed deployed to:", await priceFeed.address);

  console.log("Updating priceFeed in ListaCore...");
  await listaCore.setPriceFeed(priceFeed.address);
  console.log("Updated priceFeed in ListaCore.");

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: priceFeed.address,
        constructorArguments: [listaCore.address, params.ethFeed],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return priceFeed;
};
