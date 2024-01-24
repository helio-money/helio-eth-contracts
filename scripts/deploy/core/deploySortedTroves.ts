import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

export const deploySortedTroves = async (factory: Contract) => {
  console.log("Deploying SortedTroves...");
  const SortedTroves = await ethers.getContractFactory("SortedTroves");
  const sortedTroves = await upgrades.deployProxy(SortedTroves, [factory.target]);
  console.log("SortedTroves deployed to:", sortedTroves.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: sortedTroves.target,
        constructorArguments: [factory.target]
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return sortedTroves;
};
