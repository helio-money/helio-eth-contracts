import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

export const deploySortedTroves = async (factory: Contract) => {
  console.log("Deploying SortedTroves...");
  const SortedTroves = await ethers.getContractFactory("SortedTroves");
  const sortedTroves = await upgrades.deployProxy(SortedTroves, [factory.address]);
  console.log("SortedTroves deployed to:", sortedTroves.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: sortedTroves.address,
        constructorArguments: [factory.address]
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return sortedTroves;
};
