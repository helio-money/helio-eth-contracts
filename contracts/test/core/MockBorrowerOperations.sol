// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./InternalTroveManager.sol";
import "./MockDebtToken.sol";
import "./InternalBorrowerOperations.sol";

contract MockBorrowerOperations {
    using SafeERC20 for IERC20;

    InternalTroveManager public troveManager;
    MockDebtToken public wBETH;
    MockDebtToken public debtToken;
    uint256 public TCR;
    uint256 public globalSysPricedColl;
    uint256 public globalSysDebt;

    function setAddresses(
        InternalTroveManager value,
        MockDebtToken beth,
        MockDebtToken _debtToken
    ) public {
        troveManager = value;
        wBETH = beth;
        debtToken = _debtToken;
    }

    function setTCR(uint256 value) public {
        TCR = value;
    }

    function getTCR() external returns (uint256 globalTotalCollateralRatio) {
        return TCR;
    }

    function getETHAmount(
        uint256 collateralAmount
    ) external view returns (uint256) {
        return (collateralAmount * 123) / 10;
    }

    function openTrove(
        address _borrower,
        uint256 _collateralAmount,
        uint256 _compositeDebt,
        uint256 NICR,
        address _upperHint,
        address _lowerHint,
        bool _isRecoveryMode
    ) external payable returns (uint256 stake, uint256 arrayIndex) {
        wBETH.deposit{value: msg.value}(address(0));
        IERC20(wBETH).safeTransfer(address(troveManager), _collateralAmount);
        debtToken.mintWithGasCompensation(msg.sender, _compositeDebt);

        return
            troveManager.openTrove(
                _borrower,
                _collateralAmount,
                _compositeDebt,
                NICR,
                _upperHint,
                _lowerHint,
                _isRecoveryMode
            );
    }

    function closeTrove(
        address _borrower,
        address _receiver,
        uint256 collAmount,
        uint256 debtAmount
    ) external {
        troveManager.closeTrove(_borrower, _receiver, collAmount, debtAmount);
    }

    function updateTroveFromAdjustment(
        bool _isRecoveryMode,
        bool _isDebtIncrease,
        uint256 _debtChange,
        uint256 _netDebtChange,
        bool _isCollIncrease,
        uint256 _collChange,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _receiver
    ) external returns (uint256, uint256, uint256) {
        return
            troveManager.updateTroveFromAdjustment(
                _isRecoveryMode,
                _isDebtIncrease,
                _debtChange,
                _netDebtChange,
                _isCollIncrease,
                _collChange,
                _upperHint,
                _lowerHint,
                _borrower,
                _receiver
            );
    }

    function applyPendingRewards(
        address _borrower
    ) external returns (uint256 coll, uint256 debt) {
        return troveManager.applyPendingRewards(_borrower);
    }

    function decayBaseRateAndGetBorrowingFee(
        uint256 _debt
    ) external returns (uint256) {
        return troveManager.decayBaseRateAndGetBorrowingFee(_debt);
    }

    function setGlobalSystemBalances(uint256 pricedColl, uint256 debt) public {
        globalSysPricedColl = pricedColl;
        globalSysDebt = debt;
    }

    function getGlobalSystemBalances()
        public
        returns (uint256 totalPricedCollateral, uint256 totalDebt)
    {
        return (globalSysPricedColl, globalSysDebt);
    }
}
