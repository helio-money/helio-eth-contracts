import hre, { ethers } from "hardhat";

export const deploySortedTroves = async () => {
  console.log("Deploying SortedTroves...");
  const sortedTroves = await ethers.deployContract("SortedTroves", []);
  await sortedTroves.deployed();
  console.log("SortedTroves deployed to:", sortedTroves.address);

  await hre.run("verify:verify", {
    address: sortedTroves.address,
    constructorArguments: [],
  });

  return sortedTroves;
};
