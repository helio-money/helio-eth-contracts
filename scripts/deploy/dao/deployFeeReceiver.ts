import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployFeeReceiver = async (listaCore: Contract) => {
  console.log("Deploying FeeReceiver...");
  const feeReceiver = await ethers.deployContract("FeeReceiver", [
    listaCore.target,
  ]);
  await feeReceiver.waitForDeployment();
  console.log("FeeReceiver deployed to:", feeReceiver.target);

  console.log("Updating feeReceiver in ListaCore...");
  await listaCore.setFeeReceiver(feeReceiver.target);
  console.log("Updated feeReceiver in ListaCore...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: feeReceiver.target,
        constructorArguments: [listaCore.target],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return feeReceiver;
};
