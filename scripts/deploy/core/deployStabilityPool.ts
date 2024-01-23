import { Contract, ZeroAddress } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

export const deployStabilityPool = async (listaCore: Contract) => {
  console.log("Deploying StabilityPool...");
  const StabilityPool = await ethers.getContractFactory("StabilityPool");
  const stabilityPool = await upgrades.deployProxy(StabilityPool, [
    listaCore.target,
    ZeroAddress, // debtToken
    ZeroAddress, // vault,
    ZeroAddress, // factory
    ZeroAddress, // liquidationManager
  ]);
  console.log("StabilityPool deployed to:", stabilityPool.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: stabilityPool.target,
        constructorArguments: [
          listaCore.target,
          ZeroAddress, // debtToken
          ZeroAddress, // vault,
          ZeroAddress, // factory
          ZeroAddress, // liquidationManager
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return stabilityPool;
};
