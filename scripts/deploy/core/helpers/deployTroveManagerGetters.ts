import hre, { ethers } from "hardhat";
import { Contract } from "ethers";

export const deployTroveManagerGetters = async (factory: Contract) => {
  console.log("Deploying TroveManagerGetters...");
  const troveManagerGetters = await ethers.deployContract("TroveManagerGetters", [factory.target]);
  await troveManagerGetters.waitForDeployment();
  console.log("TroveManagerGetters deployed to:", troveManagerGetters.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: troveManagerGetters.target,
        constructorArguments: [
          factory.target
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return troveManagerGetters;
};
