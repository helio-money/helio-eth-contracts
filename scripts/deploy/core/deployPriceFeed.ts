import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployPriceFeed = async (listaCore: Contract) => {
  console.log("Deploying PriceFeed...");

  if (hre.network.name === "hardhat") {
    const ethFeed = await ethers.deployContract("MockAggregator", []);
    await ethFeed.waitForDeployment();
    const PriceFeed = await ethers.getContractFactory("PriceFeed");
    const priceFeed = await upgrades.deployProxy(PriceFeed, [
      listaCore.target,
      ethFeed.target,
    ]);

    console.log("ListaFeed deployed to:", await priceFeed.getAddress());
    return priceFeed;
  }

  const PriceFeed = await ethers.getContractFactory("PriceFeed");
  const priceFeed = await upgrades.deployProxy(PriceFeed, [
    listaCore.target,
    params.ethFeed,
  ]);

  console.log("ListaFeed deployed to:", await priceFeed.getAddress());

  console.log("Updating priceFeed in ListaCore...");
  await listaCore.setPriceFeed(priceFeed.target);
  console.log("Updated priceFeed in ListaCore.");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: priceFeed.target,
        constructorArguments: [
          listaCore.target,
          params.ethFeed,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return priceFeed;
};
