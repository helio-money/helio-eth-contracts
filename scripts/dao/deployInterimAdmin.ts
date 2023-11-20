import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import hre, { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const deployInterimAdmin = async () => {
  console.log("Deploying InterimAdmin...");
  const interimAdmin = await ethers.deployContract("InterimAdmin", [
    addresses.ListaCore,
  ]);
  await interimAdmin.deployed();
  console.log("InterimAdmin deployed to:", interimAdmin.address);

  await hre.run("verify:verify", {
    address: interimAdmin.address,
    constructorArguments: [addresses.ListaCore],
  });

  return interimAdmin;
};
