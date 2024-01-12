import { BigNumber, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { ZERO_ADDRESS } from "../../../test/ts/utils";
import { DEPLOYMENT_PARAMS } from "../../../constants/index"

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
    ethers.constants.AddressZero, // sortedTroves
    ethers.constants.AddressZero, // troveManager
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

  while (true) {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [
          listaCore.address,
          ZERO_ADDRESS, // debtToken
          stabilityPool.address, // stabilityPool
          borrowerOperations.address, // borrowerOperations
          ethers.constants.AddressZero, // sortedTroves
          ethers.constants.AddressZero, // troveManager
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

export const deployNewInstance = async (factory: Contract, priceFeed: Contract, troveManager: Contract, sortedTroves: Contract) => {
  const wBETH = DEPLOYMENT_PARAMS[11155111].wBETH;

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

  console.log("Deployed new instance...", tx.hash);
}
