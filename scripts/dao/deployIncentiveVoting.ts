import { Contract } from "ethers";
import { ethers } from "hardhat";

export const deployIncentiveVoting = async (
  listaCore: Contract,
  tokenLocker: Contract,
  vault: Contract
) => {
  console.log("Deploying IncentiveVoting...");
  const incentiveVoting = await ethers.deployContract("IncentiveVoting", [
    listaCore.address,
    tokenLocker.address,
    vault.address,
  ]);
  await incentiveVoting.waitForDeployment();
  console.log("IncentiveVoting deployed to:", await incentiveVoting.address);

  console.log("Updating IncentiveVoter in TokenLocker...");
  await tokenLocker.setIncentiveVoter(incentiveVoting.address);
  console.log("Updated IncentiveVoter in TokenLocker...");

  console.log("Updating IncentiveVoter in Vault...");
  await vault.setIncentiveVoter(incentiveVoting.address);
  console.log("Updated IncentiveVoter in Vault...");

  return incentiveVoting;
};
