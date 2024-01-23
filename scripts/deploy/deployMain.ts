import hre, { ethers } from "hardhat";
import { deployBorrowerOperations } from "./core/deployBorrowerOperations";
import { deployDebtToken } from "./core/deployDebtToken";
import { deployFactory, deployNewInstance } from "./core/deployFactory";
import { deployLiquidationManager } from "./core/deployLiquidationManager";
import { deployListaCore } from "./core/deployListaCore";
import { deployPriceFeed } from "./core/deployPriceFeed";
import { deployStabilityPool } from "./core/deployStabilityPool";
import { deploySortedTroves } from "./core/deploySortedTroves";
import { deployTroveManager } from "./core/deployTroveManager";
import { deployMultiTroveGetter } from './core/helpers/deployMultiTroveGetter';
import { deployTroveManagerGetters } from "./core/helpers/deployTroveManagerGetters";
import { deployMultiCollateralHintHelpers } from "./core/helpers/deployMultiCollateralHintHelpers";
import { deployIncentiveVoting } from "./dao/deployIncentiveVoting";
import { deployInterimAdmin } from "./dao/deployInterimAdmin";
import { deployListaToken } from "./dao/deployListaToken";
import { deployTokenLocker } from "./dao/deployTokenLocker";
import { deployVault } from "./dao/deployVault";
import { deployFeeReceiver } from "./dao/deployFeeReceiver";
import { Contract, Signer } from "ethers";
import { openTrove, depositToSP, adjustTrove, repayDebt, closeTrove } from "./test/localTest";
import { DEPLOYMENT_PARAMS } from "../../constants/index"
import { upgradeCore } from "./test/upgradeCore";

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

  let wBETH = DEPLOYMENT_PARAMS[11155111].wBETH;
  if (hre.network.name === "hardhat") {
    console.log("Deploying CollateralToken...");
    const collateralToken = await ethers.deployContract("CollateralToken", []);
    await collateralToken.deployed();
    console.log("CollateralToken deployed to:", collateralToken.address);
    wBETH = collateralToken.address;
  }
  const listaCore = await deployListaCore(owner);
  const priceFeed = await deployPriceFeed(listaCore);

  const borrowerOperations = await deployBorrowerOperations(listaCore, wBETH);

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

  // DAO
  const interimAdmin = await deployInterimAdmin(listaCore);
  const tokenLocker = await deployTokenLocker(listaCore);
  const incentiveVoting = await deployIncentiveVoting(listaCore, tokenLocker);
  const vault = await deployVault(listaCore, stabilityPool, tokenLocker, incentiveVoting);
  const listaToken = await deployListaToken(vault, tokenLocker);
  const feeReceiver = await deployFeeReceiver(listaCore);

  const troveManager = await deployTroveManager(
    listaCore,
    debtToken,
    borrowerOperations,
    liquidationManager,
    vault,
    factory,
  );
  const sortedTroves = await deploySortedTroves(factory);
  const multiTroveGetter = await deployMultiTroveGetter();
  const troveManagerGetter = await deployTroveManagerGetters(factory);
  const multiCollateralHintHelpers = await deployMultiCollateralHintHelpers(borrowerOperations);

  await deployNewInstance(factory, priceFeed, troveManager, sortedTroves, wBETH, borrowerOperations);

  console.log("ListaCore:", listaCore.address);
  console.log("PriceFeed:", priceFeed.address);
  console.log("BorrowOperations:", borrowerOperations.address);
  console.log("StabilityPool:", stabilityPool.address);
  console.log("Factory:", factory.address);
  console.log("LiquidationManager:", liquidationManager.address);
  console.log("DebtToken:", debtToken.address);
  console.log("TokenLocker:", tokenLocker.address);
  console.log("IncentiveVoting:", incentiveVoting.address);
  console.log("Vault:", vault.address);
  console.log("ListaToken:", listaToken.address);
  console.log("TroveManager:", troveManager.address);
  console.log("SortedTroves:", sortedTroves.address);
  console.log("InterimAdmin:", interimAdmin.address);
  console.log("MultiTroveGetter:", multiTroveGetter.address);
  console.log("TroveManagerGetters:", troveManagerGetter.address);
  console.log("MultiCollateralHintHelpers:", multiCollateralHintHelpers.address);
  console.log("FeeReceiver:", feeReceiver.address);

  if (hre.network.name === "hardhat") {
    await localTest(listaCore, borrowerOperations, stabilityPool, troveManager, priceFeed, sortedTroves, wBETH, liquidationManager, debtToken);
  }
}

const localTest = async (listaCore: Contract, borrowerOperations: Contract, stabilityPool: Contract, troveManager: Contract, priceFeed: Contract, sortedTroves: Contract, wBETH: string, liquidationManager: Contract, debtToken: Contract) => {
  console.log("Running local test...");
  await openTrove(troveManager, borrowerOperations, wBETH);
  await adjustTrove(troveManager, borrowerOperations);
  await repayDebt(borrowerOperations, troveManager);
  await depositToSP(stabilityPool);

  await upgradeCore(borrowerOperations, troveManager, liquidationManager, stabilityPool, priceFeed, sortedTroves);

  await adjustTrove(troveManager, borrowerOperations);
  await repayDebt(borrowerOperations, troveManager);
//  await closeTrove(borrowerOperations, troveManager, wBETH, debtToken);
  await depositToSP(stabilityPool);

  console.log("Local test done");
}