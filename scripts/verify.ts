import { DEPLOYMENT_PARAMS } from "../constants";
import { DEPLOYED_ADDRESSES } from "../constants/deployed_addresses";
import hre, { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];
const params = DEPLOYMENT_PARAMS[11155111];

async function main() {
  await hre.run("verify:verify", {
    address: addresses.ListaCore,
    constructorArguments: [
      params.owner,
      params.guardian,
      ethers.constants.AddressZero,
      params.feeReceiver,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.PriceFeed,
    constructorArguments: [addresses.ListaCore, params.ethFeed],
  });

  await hre.run("verify:verify", {
    address: addresses.BorrowOperations,
    constructorArguments: [
      addresses.ListaCore,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      params.minNetDebt,
      params.gasCompensation,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.StabilityPool,
    constructorArguments: [
      addresses.ListaCore,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.Factory,
    constructorArguments: [
      addresses.ListaCore,
      ethers.constants.AddressZero,
      addresses.StabilityPool,
      addresses.BorrowOperations,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.LiquidationManager,
    constructorArguments: [
      addresses.StabilityPool,
      addresses.BorrowOperations,
      addresses.Factory,
      params.gasCompensation,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.DebtToken,
    constructorArguments: [
      params.debtTokenName,
      params.debtTokenSymbol,
      addresses.StabilityPool,
      addresses.BorrowOperations,
      addresses.ListaCore,
      params.lzEndpoint,
      addresses.Factory,
      params.gasPool,
      params.gasCompensation,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.TokenLocker,
    constructorArguments: [
      addresses.ListaCore,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      params.manager,
      params.lockToTokenRatio,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.IncentiveVoting,
    constructorArguments: [
      addresses.ListaCore,
      addresses.TokenLocker,
      ethers.constants.AddressZero,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.Vault,
    constructorArguments: [
      addresses.ListaCore,
      ethers.constants.AddressZero,
      addresses.TokenLocker,
      addresses.IncentiveVoting,
      addresses.StabilityPool,
      params.manager,
    ],
  });

  await hre.run("verify:verify", {
    address: addresses.ListaToken,
    constructorArguments: [
      addresses.Vault,
      params.lzEndpoint,
      addresses.TokenLocker,
    ],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
