// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../core/BorrowerOperations.sol";

contract MockTroveManager {
    bool public sunsetting;
    uint public entireSystemColl;
    uint256 public entireSystemDebt;
    uint256 public price;
    uint256 public feeRate;
    uint256 public MCR;
    uint256 public pendingCollReward;
    uint256 public pendingDebtReward;

    function setMCR(uint256 value) public {
        MCR = value;
    }

    function setSunsetting(bool value) public {
        sunsetting = value;
    }

    function setEntireSystemDebt(uint256 value) public {
        entireSystemDebt = value;
    }

    function getEntireSystemDebt() public view returns (uint256) {
        return entireSystemDebt;
    }

    function setEntireSystemColl(uint256 value) public {
        entireSystemColl = value;
    }

    function setPrice(uint256 value) public {
        price = value;
    }

    function getEntireSystemBalances()
        external
        view
        returns (uint256, uint256, uint256)
    {
        return (entireSystemColl, entireSystemDebt, price);
    }

    function setFeeRate(uint256 value) public {
        feeRate = value;
    }

    function decayBaseRateAndGetBorrowingFee(
        uint256 amount
    ) public view returns (uint256) {
        return (feeRate * amount) / 1e18;
    }

    function withdrawCollInETHHelper(
        BorrowerOperations operator,
        address receiver,
        uint256 amount
    ) public {
        operator.withdrawCollInETH(receiver, amount);
    }

    function openTrove(
        address /*_borrower*/,
        uint256 _collateralAmount,
        uint256 /*_compositeDebt*/,
        uint256 /*NICR*/,
        address /*_upperHint*/,
        address /*_lowerHint*/,
        bool /*_isRecoveryMode*/
    ) public pure returns (uint256 stake, uint256 arrayIndex) {
        return (_collateralAmount, 0);
    }

    enum TroveManagerOperation {
        open,
        close,
        adjust,
        liquidate,
        redeemCollateral
    }
    event TroveUpdated(
        address indexed _borrower,
        uint256 _debt,
        uint256 _coll,
        uint256 _stake,
        TroveManagerOperation _operation
    );

    function closeTrove(
        address _borrower,
        address /*_receiver*/,
        uint256 /*collAmount*/,
        uint256 /*debtAmount*/
    ) public {
        emit TroveUpdated(_borrower, 0, 0, 0, TroveManagerOperation.close);
    }

    function setPendingRewards(uint256 collReward, uint256 debtReward) public {
        pendingCollReward = collReward;
        pendingDebtReward = debtReward;
    }

    function applyPendingRewards(
        address /*_borrower*/
    ) public view returns (uint256 coll, uint256 debt) {
        return (pendingCollReward, pendingDebtReward);
    }

    function updateTroveFromAdjustment(
        bool /*_isRecoveryMode*/,
        bool /*_isDebtIncrease*/,
        uint256 /*_debtChange*/,
        uint256 /*_netDebtChange*/,
        bool /*_isCollIncrease*/,
        uint256 /*_collChange*/,
        address /*_upperHint*/,
        address /*_lowerHint*/,
        address /*_borrower*/,
        address /*_receive*/
    ) external pure returns (uint256, uint256, uint256) {
        return (0, 0, 0);
    }
}
