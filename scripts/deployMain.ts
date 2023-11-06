import { deployBorrowerOperations } from "./core/deployBorrowerOperations";
import { deployDebtToken } from "./core/deployDebtToken";
import { deployFactory } from "./core/deployFactory";
import { deployLiquidationManager } from "./core/deployLiquidationManager";
import { deployPrismaCore } from "./core/deployPrismaCore";
import { deployPrismaFeed } from "./core/deployPrismaFeed";
import { deployStabilityPool } from "./core/deployStabilityPool";
import { deployIncentiveVoting } from "./dao/deployIncentiveVoting";
import { deployPrismaToken } from "./dao/deployPrismaToken";
import { deployTokenLocker } from "./dao/deployTokenLocker";
import { deployVault } from "./dao/deployVault";

export const deployMain = async () => {
  // Core
  const prismaCore = await deployPrismaCore();
  const prismaFeed = await deployPrismaFeed(prismaCore);
  const borrowerOperations = await deployBorrowerOperations(prismaCore);
  const stabilityPool = await deployStabilityPool(prismaCore);
  const factory = await deployFactory(
    prismaCore,
    stabilityPool,
    borrowerOperations
  );
  const liquidationManager = await deployLiquidationManager(
    stabilityPool,
    borrowerOperations,
    factory
  );
  const debtToken = await deployDebtToken(
    prismaCore,
    stabilityPool,
    borrowerOperations,
    factory
  );

  // DAO
  const tokenLocker = await deployTokenLocker(prismaCore);
  const vault = await deployVault(prismaCore, stabilityPool, tokenLocker);
  const incentiveVoting = await deployIncentiveVoting(
    prismaCore,
    tokenLocker,
    vault
  );
  const prismaToken = await deployPrismaToken(vault, tokenLocker);
};
