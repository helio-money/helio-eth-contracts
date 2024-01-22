import { BigNumber, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { ZERO_ADDRESS } from "../../../test/ts/utils";

export const deployFactory = async (
  listaCore: Contract,
  stabilityPool: Contract,
  borrowerOperations: Contract
) => {
  console.log("Deploying Factory...");
  const factory = await ethers.deployContract("Factory", [
    listaCore.address,
    ZERO_ADDRESS, // debtToken
    stabilityPool.address, // stabilityPool
    borrowerOperations.address, // borrowerOperations
    ethers.constants.AddressZero, // liquidationManager
  ]);
  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  console.log("Updating factory in StabilityPool...");
  await stabilityPool.setFactory(factory.address);
  console.log("Updated factory in StabilityPool...");

  console.log("Updating factory in BorrowerOperations...");
  await borrowerOperations.setFactory(factory.address);
  console.log("Updated factory in BorrowerOperations...");

  expect(await factory.borrowerOperations()).to.be.equal(borrowerOperations.address);

  while (hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [
          listaCore.address,
          ZERO_ADDRESS, // debtToken
          stabilityPool.address, // stabilityPool
          borrowerOperations.address, // borrowerOperations
          ethers.constants.AddressZero, // liquidationManager
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
    await ethFeed.deployed();

    await priceFeed.setOracle(wBETH, ethFeed.address, 3600, "0x00000000", 18, false);
  }

  try {
    const tx = await factory.deployNewInstance(
      wBETH,
      priceFeed.address,
      troveManager.address,
      sortedTroves.address,
      {
        minuteDecayFactor: BigNumber.from('999037758833783000'), // minuteDecayFactor
        redemptionFeeFloor: 0, // redemptionFeeFloor
        maxRedemptionFee: 0, // redemptionFeeCeil
        borrowingFeeFloor: BigNumber.from('5000000000000000'), // borrowFeeFloor
        maxBorrowingFee: BigNumber.from('50000000000000000'), // borrowFeeCeil
        interestRateInBps: 0, // interestRateInBps
        maxDebt: BigNumber.from('200000000000000000000000000'), // maxDebt
        MCR: BigNumber.from('1100000000000000000') // MCR
      }
    );
    expect(tx).to.emit(factory, "NewDeployment").withArgs(wBETH, priceFeed.address, troveManager.address, sortedTroves.address);
    expect(tx).to.emit(borrowerOperations, "CollateralConfigured").withArgs(troveManager.address, wBETH);

    expect(await factory.troveManagers(0)).to.be.equal(troveManager.address);

    console.log("Deployed new instance...", tx.hash);
  } catch (e) {
    console.log("deployNewInstance error", e);
  }
}
