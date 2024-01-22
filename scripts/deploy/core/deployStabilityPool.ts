import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";
import { DEPLOYMENT_PARAMS } from "../../../constants";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployStabilityPool = async (listaCore: Contract) => {
  console.log("Deploying StabilityPool...");
  const StabilityPool = await ethers.getContractFactory("StabilityPool");
  const stabilityPool = await upgrades.deployProxy(StabilityPool, [
    listaCore.address,
    ethers.constants.AddressZero, // debtToken
    ethers.constants.AddressZero, // vault,
    ethers.constants.AddressZero, // factory
    ethers.constants.AddressZero, // liquidationManager
  ]);
  console.log("StabilityPool deployed to:", stabilityPool.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: stabilityPool.address,
        constructorArguments: [
          listaCore.address,
          ethers.constants.AddressZero, // debtToken
          ethers.constants.AddressZero, // vault,
          ethers.constants.AddressZero, // factory
          ethers.constants.AddressZero, // liquidationManager
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return stabilityPool;
};

export const depositToSP = async (stabilityPool: Contract) => {
  await stabilityPool.provideToSP(100);
  console.log("Deposited 100 lisUSD to StabilityPool");
}