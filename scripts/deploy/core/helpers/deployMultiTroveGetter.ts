import hre, { ethers } from "hardhat";

export const deployMultiTroveGetter = async () => {
  console.log("Deploying MultiTroveGetter...");
  const multiTroveGetter = await ethers.deployContract("MultiTroveGetter", []);
  await multiTroveGetter.deployed();
  console.log("MultiTroveGetter deployed to:", multiTroveGetter.address);

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: multiTroveGetter.address,
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return multiTroveGetter;
};
