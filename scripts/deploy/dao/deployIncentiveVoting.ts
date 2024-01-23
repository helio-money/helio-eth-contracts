import { Contract, ZeroAddress } from "ethers";
import hre, { ethers } from "hardhat";

export const deployIncentiveVoting = async (
  listaCore: Contract,
  tokenLocker: Contract
) => {
  console.log("Deploying IncentiveVoting...");
  const incentiveVoting = await ethers.deployContract("IncentiveVoting", [
    listaCore.target,
    tokenLocker.target,
    ZeroAddress
  ]);
  await incentiveVoting.waitForDeployment();
  console.log("IncentiveVoting deployed to:", incentiveVoting.target);

  console.log("Updating IncentiveVoter in TokenLocker...");
  await tokenLocker.setIncentiveVoter(incentiveVoting.target);
  console.log("Updated IncentiveVoter in TokenLocker...");

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: incentiveVoting.target,
        constructorArguments: [
          listaCore.target,
          tokenLocker.target,
          ZeroAddress,
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...");
    }
  }

  return incentiveVoting;
};
