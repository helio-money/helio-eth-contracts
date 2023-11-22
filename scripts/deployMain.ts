import { deployBorrowerOperations } from "./core/deployBorrowerOperations";
import { deployDebtToken } from "./core/deployDebtToken";
import { deployFactory } from "./core/deployFactory";
import { deployLiquidationManager } from "./core/deployLiquidationManager";
import { deployListaCore } from "./core/deployListaCore";
import { deployPriceFeed } from "./core/deployPriceFeed";
import { deployStabilityPool } from "./core/deployStabilityPool";
import { deployIncentiveVoting } from "./dao/deployIncentiveVoting";
import { deployInterimAdmin } from "./dao/deployInterimAdmin";
import { deployListaToken } from "./dao/deployListaToken";
import { deploySortedTroves } from "./dao/deploySortedTroves";
import { deployTokenLocker } from "./dao/deployTokenLocker";
import { deployTroveManager } from "./dao/deployTroveManager";
import { deployVault } from "./dao/deployVault";
import { deployCollateralToken } from "./test/deployCollateralToken";

export const deployMain = async () => {
  const collateralToken = await deployCollateralToken(); // Test Collateral
  const listaCore = await deployListaCore();
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
  const tokenLocker = await deployTokenLocker(listaCore);
  const incentiveVoting = await deployIncentiveVoting(listaCore, tokenLocker);
  const vault = await deployVault(
    listaCore,
    stabilityPool,
    tokenLocker,
    incentiveVoting
  );
  const listaToken = await deployListaToken(vault, tokenLocker);
  const troveManager = await deployTroveManager(
    listaCore,
    debtToken,
    borrowerOperations,
    vault,
    liquidationManager
  );
  const sortedTroves = await deploySortedTroves();
  const interimAdmin = await deployInterimAdmin(listaCore);

  console.log("Test Token:", collateralToken.address);
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
};
