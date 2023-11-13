import { deployBorrowerOperations } from "./core/deployBorrowerOperations";
import { deployDebtToken } from "./core/deployDebtToken";
import { deployFactory } from "./core/deployFactory";
import { deployLiquidationManager } from "./core/deployLiquidationManager";
import { deployListaCore } from "./core/deployListaCore";
import { deployListaFeed } from "./core/deployListaFeed";
import { deployStabilityPool } from "./core/deployStabilityPool";
import { deployIncentiveVoting } from "./dao/deployIncentiveVoting";
import { deployListaToken } from "./dao/deployListaToken";
import { deployTokenLocker } from "./dao/deployTokenLocker";
import { deployVault } from "./dao/deployVault";

export const deployMain = async () => {
  // Core
  const listaCore = await deployListaCore();
  const listaFeed = await deployListaFeed(listaCore);
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

  // DAO
  const tokenLocker = await deployTokenLocker(listaCore);
  const vault = await deployVault(listaCore, stabilityPool, tokenLocker);
  const incentiveVoting = await deployIncentiveVoting(
    listaCore,
    tokenLocker,
    vault
  );
  const listaToken = await deployListaToken(vault, tokenLocker);
};
