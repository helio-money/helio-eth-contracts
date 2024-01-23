import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployInterimAdmin = async (listaCore: Contract) => {
  console.log("Deploying InterimAdmin...");
  const interimAdmin = await ethers.deployContract("InterimAdmin", [
    listaCore.target,
  ]);
  await interimAdmin.waitForDeployment();
  console.log("InterimAdmin deployed to:", interimAdmin.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: interimAdmin.target,
        constructorArguments: [listaCore.target],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return interimAdmin;
};
