import hre, { ethers } from "hardhat";
import { deployBorrowerOperations } from "./core/deployBorrowerOperations";
import { deployDebtToken } from "./core/deployDebtToken";
import { deployFactory, deployNewInstance } from "./core/deployFactory";
import { deployLiquidationManager } from "./core/deployLiquidationManager";
import { deployListaCore } from "./core/deployListaCore";
import { deployPriceFeed } from "./core/deployPriceFeed";
import { deployStabilityPool } from "./core/deployStabilityPool";
import { deployMultiTroveGetter } from './core/helpers/deployMultiTroveGetter';
import { deployTroveManagerGetters } from "./core/helpers/deployTroveManagerGetters";
import { deployMultiCollateralHintHelpers } from "./core/helpers/deployMultiCollateralHintHelpers";
import { deployIncentiveVoting } from "./dao/deployIncentiveVoting";
import { deployInterimAdmin } from "./dao/deployInterimAdmin";
import { deployListaToken } from "./dao/deployListaToken";
import { deploySortedTroves } from "./dao/deploySortedTroves";
import { deployTokenLocker } from "./dao/deployTokenLocker";
import { deployTroveManager } from "./dao/deployTroveManager";
import { deployVault } from "./dao/deployVault";
import { deployCollateralToken } from "./test/deployCollateralToken";
import { Contract, Signer } from "ethers";


export const deployMain = async () => {
  let owner: Signer;
  if (hre.network.name === "hardhat") {
    const signers = await ethers.getSigners();
    owner = signers[0];
  } else if (hre.network.name === "sepolia") {
    const deployerKey = process.env.SEPOLIA_DEPLOYER_KEY || ""; // Provide a default value if undefined
    owner = new ethers.Wallet(deployerKey);
  } else {
    throw Error("Unsupported network");
  }

  //  const collateralToken = await deployCollateralToken(); // Test Collateral, use existing wBETH on sepolia
  const listaCore = await deployListaCore(owner);
  const priceFeed = await deployPriceFeed(listaCore);
  const borrowerOperations = await deployBorrowerOperations(listaCore);
  const stabilityPool = await deployStabilityPool(listaCore);
  const factory = await deployFactory(
    listaCore,
    stabilityPool,
    borrowerOperations
  );
  const liquidationManager = await deployLiquidationManager(
    stabilityPool,
    borrowerOperations,
    factory
  );
  const debtToken = await deployDebtToken(
    listaCore,
    stabilityPool,
    borrowerOperations,
    factory
  );

  const troveManager = await deployTroveManager(
    listaCore,
    debtToken,
    borrowerOperations,
    liquidationManager,
  );
  const sortedTroves = await deploySortedTroves();
  const multiTroveGetter = await deployMultiTroveGetter();
  const troveManagerGetter = await deployTroveManagerGetters(factory);
  const multiCollateralHintHelpers = await deployMultiCollateralHintHelpers(borrowerOperations);

  deployNewInstance(factory, priceFeed, troveManager, sortedTroves);

  //  console.log("TestToken:", collateralToken.address);
  console.log("ListaCore:", listaCore.address);
  console.log("PriceFeed:", priceFeed.address);
  console.log("BorrowOperations:", borrowerOperations.address);
  console.log("StabilityPool:", stabilityPool.address);
  console.log("Factory:", factory.address);
  console.log("LiquidationManager:", liquidationManager.address);
  console.log("DebtToken:", debtToken.address);
  console.log("ListaToken:", debtToken.address);
  console.log("Impl TroveManager:", troveManager.address);
  console.log("Impl SortedTroves:", sortedTroves.address);
  console.log("MultiTroveGetter:", multiTroveGetter.address);
  console.log("TroveManagerGetter:", troveManagerGetter.address);
  console.log("MultiCollateralHintHelpers:", multiCollateralHintHelpers.address);
}

const deployDao = async () => {
}
