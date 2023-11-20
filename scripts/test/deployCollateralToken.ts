import hre, { ethers } from "hardhat";

export const deployCollateralToken = async () => {
  console.log("Deploying CollateralToken...");
  const collateralToken = await ethers.deployContract("CollateralToken", []);
  await collateralToken.deployed();
  console.log("CollateralToken deployed to:", collateralToken.address);

  await hre.run("verify:verify", {
    address: collateralToken.address,
    constructorArguments: [],
  });

  return collateralToken;
};
