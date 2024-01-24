// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/ListaOwnable.sol";
import "../interfaces/ITroveManager.sol";
import "../interfaces/IBorrowerOperations.sol";
import "../interfaces/IDebtToken.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/IStabilityPool.sol";
import "../interfaces/ILiquidationManager.sol";

/**
    @title Lista Trove Factory
    @notice Configure pairs of `TroveManager` and `SortedTroves` in order to
            add new collateral types within the system.
 */
contract Factory is ListaOwnable {
    // fixed single-deployment contracts
    IDebtToken public debtToken;
    IStabilityPool public stabilityPool;
    ILiquidationManager public liquidationManager;
    IBorrowerOperations public borrowerOperations;

    address[] public troveManagers;

    // commented values are suggested default parameters
    struct DeploymentParams {
        uint256 minuteDecayFactor; // 999037758833783000  (half life of 12 hours)
        uint256 redemptionFeeFloor; // 1e18 / 1000 * 5  (0.5%)
        uint256 maxRedemptionFee; // 1e18  (100%)
        uint256 borrowingFeeFloor; // 1e18 / 1000 * 5  (0.5%)
        uint256 maxBorrowingFee; // 1e18 / 100 * 5  (5%)
        uint256 interestRateInBps; // 100 (1%)
        uint256 maxDebt;
        uint256 MCR; // 12 * 1e17  (120%)
    }

    event NewDeployment(
        address collateral,
        address priceFeed,
        address troveManager,
        address sortedTroves
    );

    constructor(
        address _listaCore,
        IDebtToken _debtToken,
        IStabilityPool _stabilityPool,
        IBorrowerOperations _borrowerOperations,
        ILiquidationManager _liquidationManager
    ) ListaOwnable(_listaCore) {
        setDebtToken(_debtToken);
        setStabilityPool(_stabilityPool);
        setBorrowerOperations(_borrowerOperations);
        setLiquidationManager(_liquidationManager);
    }

    function setDebtToken(IDebtToken _debtTokenAddress) public onlyOwner {
        debtToken = _debtTokenAddress;
    }

    function setStabilityPool(IStabilityPool _stabilityPool) public onlyOwner {
        stabilityPool = _stabilityPool;
    }

    function setBorrowerOperations(
        IBorrowerOperations _borrowerOperations
    ) public onlyOwner {
        borrowerOperations = _borrowerOperations;
    }

    function setLiquidationManager(
        ILiquidationManager _liquidationManager
    ) public onlyOwner {
        liquidationManager = _liquidationManager;
    }

    function troveManagerCount() external view returns (uint256) {
        return troveManagers.length;
    }

    /**
        @notice Deploy new instances of `TroveManager` and `SortedTroves`, adding
                a new collateral type to the system.
        @dev * When using the default `PriceFeed`, ensure it is configured correctly
               prior to calling this function.
             * After calling this function, the owner should also call `Vault.registerReceiver`
               to enable LISTA emissions on the newly deployed `TroveManager`
        @param collateral Collateral token to use in new deployment
        @param priceFeed Custom `PriceFeed` deployment. Leave as `address(0)` to use the default.
        @param troveManager Address of `TroveManager` proxy.
        @param sortedTroves Address of `SortedTroves` proxy.
        @param params Struct of initial parameters to be set on the new trove manager
     */
    function deployNewInstance(
        address collateral,
        address priceFeed,
        address troveManager,
        address sortedTroves,
        DeploymentParams memory params
    ) external onlyOwner {
        troveManagers.push(troveManager);

        ITroveManager(troveManager).setAddresses(
            priceFeed,
            sortedTroves,
            collateral
        );
        ISortedTroves(sortedTroves).setAddresses(troveManager);

        // verify that the oracle is correctly working
        ITroveManager(troveManager).fetchPrice();

        stabilityPool.enableCollateral(collateral);
        liquidationManager.enableTroveManager(troveManager);
        debtToken.enableTroveManager(troveManager);
        borrowerOperations.configureCollateral(troveManager, collateral);

        ITroveManager(troveManager).setParameters(
            params.minuteDecayFactor,
            params.redemptionFeeFloor,
            params.maxRedemptionFee,
            params.borrowingFeeFloor,
            params.maxBorrowingFee,
            params.interestRateInBps,
            params.maxDebt,
            params.MCR
        );

        emit NewDeployment(collateral, priceFeed, troveManager, sortedTroves);
    }
}
