// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../core/LiquidationManager.sol";

import "hardhat/console.sol";

contract InternalLiquidationManager is LiquidationManager {
    constructor(
        IStabilityPool _stabilityPoolAddress,
        IBorrowerOperations _borrowerOperations,
        address _factory,
        uint256 _gasCompensation
    )
    {
        LiquidationManager.initialize(_stabilityPoolAddress, _borrowerOperations, _factory, _gasCompensation);
    }

    function applyLiquidationValuesToTotals(
        LiquidationTotals memory totals,
        LiquidationValues memory singleLiquidation
    ) public pure returns (LiquidationTotals memory returnedTotals) {
        super._applyLiquidationValuesToTotals(totals, singleLiquidation);
        return totals;
    }

    function liquidateNormalMode(
        ITroveManager troveManager,
        address _borrower,
        uint256 _debtInStabPool,
        bool sunsetting
    ) public returns (LiquidationValues memory singleLiquidation) {
        singleLiquidation = super._liquidateNormalMode(
            troveManager,
            _borrower,
            _debtInStabPool,
            sunsetting
        );
    }

    function getOffsetAndRedistributionVals(
        uint256 _debt,
        uint256 _coll,
        uint256 _debtInStabPool,
        bool sunsetting
    )
        public
        pure
        returns (
            uint256 debtToOffset,
            uint256 collToSendToSP,
            uint256 debtToRedistribute,
            uint256 collToRedistribute
        )
    {
        return
            super._getOffsetAndRedistributionVals(
                _debt,
                _coll,
                _debtInStabPool,
                sunsetting
            );
    }

    function liquidateWithoutSP(
        ITroveManager troveManager,
        address _borrower
    ) public returns (LiquidationValues memory singleLiquidation) {
        return super._liquidateWithoutSP(troveManager, _borrower);
    }

    function tryLiquidateWithCap(
        ITroveManager troveManager,
        address _borrower,
        uint256 _debtInStabPool,
        uint256 _MCR,
        uint256 _price
    ) public returns (LiquidationValues memory singleLiquidation) {
        return
            super._tryLiquidateWithCap(
                troveManager,
                _borrower,
                _debtInStabPool,
                _MCR,
                _price
            );
    }
}
