// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../core/BorrowerOperations.sol";

contract InternalBorrowerOperations is BorrowerOperations {
    constructor(
        address _listaCore,
        address _wBETH,
        address _referral,
        address _debtTokenAddress,
        address _factory,
        uint256 _minNetDebt,
        uint256 _gasCompensation
    )
    {
        BorrowerOperations.initialize(_listaCore, _wBETH, _referral, _debtTokenAddress, _factory, _minNetDebt, _gasCompensation);
    }

    function getTroveManagersLength() public view returns (uint256) {
        return _troveManagers.length;
    }

    function getCollateralAmount(
        uint256 ethAmount
    ) public view returns (uint256) {
        return super._getCollateralAmount(ethAmount);
    }

    function getCollChange(
        uint256 _collReceived,
        uint256 _requestedCollWithdrawal
    ) public pure returns (uint256 collChange, bool isCollIncrease) {
        return super._getCollChange(_collReceived, _requestedCollWithdrawal);
    }

    function requireICRisAboveMCR(uint256 _newICR, uint256 MCR) public pure {
        super._requireICRisAboveMCR(_newICR, MCR);
    }

    function requireICRisAboveCCR(uint256 _newICR) public pure {
        super._requireICRisAboveCCR(_newICR);
    }

    function requireNewICRisAboveOldICR(
        uint256 _newICR,
        uint256 _oldICR
    ) public pure {
        super._requireNewICRisAboveOldICR(_newICR, _oldICR);
    }

    function requireNewTCRisAboveCCR(uint256 _newTCR) public pure {
        super._requireNewTCRisAboveCCR(_newTCR);
    }

    function requireAtLeastMinNetDebt(uint256 _netDebt) public view {
        super._requireAtLeastMinNetDebt(_netDebt);
    }

    function requireValidMaxFeePercentage(
        uint256 _maxFeePercentage
    ) public pure {
        super._requireValidMaxFeePercentage(_maxFeePercentage);
    }

    function requireValidwBETHAmount(
        uint256 ethAmount,
        uint256 collateralAmount
    ) public payable {
        super._requireValidwBETHAmount(ethAmount, collateralAmount);
    }

    function getNewTroveAmounts(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) public pure returns (uint256, uint256) {
        return
            super._getNewTroveAmounts(
                _coll,
                _debt,
                _collChange,
                _isCollIncrease,
                _debtChange,
                _isDebtIncrease
            );
    }

    function getNewTCRFromTroveChange(
        uint256 totalColl,
        uint256 totalDebt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) public pure returns (uint256) {
        return
            super._getNewTCRFromTroveChange(
                totalColl,
                totalDebt,
                _collChange,
                _isCollIncrease,
                _debtChange,
                _isDebtIncrease
            );
    }

    function getNewICRFromTroveChange(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) public pure returns (uint256) {
        return
            super._getNewICRFromTroveChange(
                _coll,
                _debt,
                _collChange,
                _isCollIncrease,
                _debtChange,
                _isDebtIncrease,
                _price
            );
    }

    function getTCRData(
        SystemBalances memory balances
    )
        public
        pure
        returns (
            uint256 amount,
            uint256 totalPricedCollateral,
            uint256 totalDebt
        )
    {
        return super._getTCRData(balances);
    }

    function getCollateralAndTCRData(
        ITroveManager troveManager
    )
        public
        returns (
            IERC20 collateralToken,
            uint256 price,
            uint256 totalPricedCollateral,
            uint256 totalDebt,
            bool isRecoveryMode
        )
    {
        return super._getCollateralAndTCRData(troveManager);
    }

    function requireValidAdjustmentInCurrentMode(
        uint256 totalPricedCollateral,
        uint256 totalDebt,
        bool _isRecoveryMode,
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) public pure {
        super._requireValidAdjustmentInCurrentMode(
            totalPricedCollateral,
            totalDebt,
            _isRecoveryMode,
            _collWithdrawal,
            _isDebtIncrease,
            _vars
        );
    }

    function requireUserAcceptsFee(
        uint256 _fee,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) public pure {
        super._requireUserAcceptsFee(_fee, _amount, _maxFeePercentage);
    }

    function triggerBorrowingFee(
        ITroveManager _troveManager,
        IERC20 collateralToken,
        address _caller,
        uint256 _maxFeePercentage,
        uint256 _debtAmount
    ) public returns (uint256) {
        return
            super._triggerBorrowingFee(
                _troveManager,
                collateralToken,
                _caller,
                _maxFeePercentage,
                _debtAmount
            );
    }

    function transferETH() public payable {}
}
