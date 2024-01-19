import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployInterimAdmin = async (listaCore: Contract) => {
  console.log("Deploying InterimAdmin...");
  const interimAdmin = await ethers.deployContract("InterimAdmin", [
    listaCore.address,
  ]);
  await interimAdmin.deployed();
  console.log("InterimAdmin deployed to:", interimAdmin.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: interimAdmin.address,
        constructorArguments: [listaCore.address],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return interimAdmin;
};
