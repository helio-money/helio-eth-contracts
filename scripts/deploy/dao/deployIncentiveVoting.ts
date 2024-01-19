import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

export const deployIncentiveVoting = async (
  listaCore: Contract,
  tokenLocker: Contract
) => {
  console.log("Deploying IncentiveVoting...");
  const incentiveVoting = await ethers.deployContract("IncentiveVoting", [
    listaCore.address,
    tokenLocker.address,
    ethers.constants.AddressZero, // vault
  ]);
  await incentiveVoting.deployed();
  console.log("IncentiveVoting deployed to:", incentiveVoting.address);

  console.log("Updating IncentiveVoter in TokenLocker...");
  await tokenLocker.setIncentiveVoter(incentiveVoting.address);
  console.log("Updated IncentiveVoter in TokenLocker...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: incentiveVoting.address,
        constructorArguments: [
          listaCore.address,
          tokenLocker.address,
          ethers.constants.AddressZero,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return incentiveVoting;
};
