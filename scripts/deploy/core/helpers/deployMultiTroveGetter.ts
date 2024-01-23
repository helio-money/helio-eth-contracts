import hre, { ethers } from "hardhat";

export const deployMultiTroveGetter = async () => {
  console.log("Deploying MultiTroveGetter...");
  const multiTroveGetter = await ethers.deployContract("MultiTroveGetter", []);
  await multiTroveGetter.waitForDeployment();
  console.log("MultiTroveGetter deployed to:", multiTroveGetter.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: multiTroveGetter.target,
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return multiTroveGetter;
};
