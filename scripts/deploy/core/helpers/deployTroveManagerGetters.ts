import hre, { ethers } from "hardhat";
import { Contract } from "ethers";

export const deployTroveManagerGetters = async (factory: Contract) => {
  console.log("Deploying TroveManagerGetters...");
  const troveManagerGetters = await ethers.deployContract("TroveManagerGetters", [factory.address]);
  await troveManagerGetters.deployed();
  console.log("TroveManagerGetters deployed to:", troveManagerGetters.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: troveManagerGetters.address,
        constructorArguments: [
          factory.address
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return troveManagerGetters;
};
