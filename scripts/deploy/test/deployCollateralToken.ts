import hre, { ethers } from "hardhat";

export const deployCollateralToken = async () => {
  console.log("Deploying CollateralToken...");
  const collateralToken = await ethers.deployContract("CollateralToken", []);
  await collateralToken.deployed();
  console.log("CollateralToken deployed to:", collateralToken.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: collateralToken.address,
        constructorArguments: [],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return collateralToken;
};
