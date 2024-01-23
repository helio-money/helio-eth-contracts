import { BigInt, Contract, ZeroAddress } from "ethers";
import hre, { ethers } from "hardhat";
import { expect } from "chai";

export const deployFactory = async (
  listaCore: Contract,
  stabilityPool: Contract,
  borrowerOperations: Contract
) => {
  console.log("Deploying Factory...");
  const factory = await ethers.deployContract("Factory", [
    listaCore.target,
    ZeroAddress, // debtToken
    stabilityPool.target, // stabilityPool
    borrowerOperations.target, // borrowerOperations
    ZeroAddress, // liquidationManager
  ]);
  await factory.waitForDeployment();
  console.log("Factory deployed to:", factory.target);

  console.log("Updating factory in StabilityPool...");
  await stabilityPool.setFactory(factory.target);
  console.log("Updated factory in StabilityPool...");

  console.log("Updating factory in BorrowerOperations...");
  await borrowerOperations.setFactory(factory.target);
  console.log("Updated factory in BorrowerOperations...");

  expect(await factory.borrowerOperations()).to.be.equal(borrowerOperations.target);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.target,
        constructorArguments: [
          listaCore.target,
          ZeroAddress, // debtToken
          stabilityPool.target, // stabilityPool
          borrowerOperations.target, // borrowerOperations
          ZeroAddress, // liquidationManager
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return factory;
};

export const deployNewInstance = async (factory: Contract, priceFeed: Contract, troveManager: Contract, sortedTroves: Contract, wBETH: string, borrowerOperations: Contract) => {

  if (hre.network.name === "hardhat") {
    const ethFeed = await ethers.deployContract("MockAggregator", []);
    await ethFeed.waitForDeployment();

    await priceFeed.setOracle(wBETH, ethFeed.target, 3600, "0x00000000", 18, false);
  }

  try {
    const tx = await factory.deployNewInstance(
      wBETH,
      priceFeed.target,
      troveManager.target,
      sortedTroves.target,
      {
        minuteDecayFactor: 999037758833783000n, // minuteDecayFactor
        redemptionFeeFloor: 0, // redemptionFeeFloor
        maxRedemptionFee: 0, // redemptionFeeCeil
        borrowingFeeFloor: 5000000000000000n, // borrowFeeFloor
        maxBorrowingFee: 50000000000000000n, // borrowFeeCeil
        interestRateInBps: 0, // interestRateInBps
        maxDebt: 200000000000000000000000000n, // maxDebt
        MCR: 1100000000000000000n // MCR
      }
    );
    //expect(tx).to.emit(factory, "NewDeployment").withArgs(wBETH, priceFeed.target, troveManager.target, sortedTroves.target);
    //expect(tx).to.emit(borrowerOperations, "CollateralConfigured").withArgs(troveManager.target, wBETH);

    expect(await factory.troveManagers(0)).to.be.equal(troveManager.target);

    console.log("Deployed new instance...", tx.hash);
  } catch (e) {
    console.log("deployNewInstance error", e);
  }
}
