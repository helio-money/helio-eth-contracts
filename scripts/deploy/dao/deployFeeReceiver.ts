import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployFeeReceiver = async (listaCore: Contract) => {
  console.log("Deploying FeeReceiver...");
  const feeReceiver = await ethers.deployContract("FeeReceiver", [
    listaCore.address,
  ]);
  await feeReceiver.deployed();
  console.log("FeeReceiver deployed to:", feeReceiver.address);

  console.log("Updating feeReceiver in ListaCore...");
  await listaCore.setFeeReceiver(feeReceiver.address);
  console.log("Updated feeReceiver in ListaCore...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: feeReceiver.address,
        constructorArguments: [listaCore.address],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return feeReceiver;
};
