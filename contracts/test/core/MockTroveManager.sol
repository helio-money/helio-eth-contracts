// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../core/BorrowerOperations.sol";
import "../../core/SortedTroves.sol";

contract MockTroveManager {
    bool public sunsetting;
    uint public entireSystemColl;
    uint256 public entireSystemDebt;
    uint256 public price;
    uint256 public feeRate;
    uint256 public MCR;
    uint256 public _pendingCollReward;
    uint256 public _pendingDebtReward;
    SortedTroves public sortedTroves;
    mapping(address => uint256) public idToNICR;
    mapping(address => uint256) public idToICR;
    mapping(address => Trove) public Troves;
    uint256 public troveOwnersCount;

    struct Trove {
        uint256 debt;
        uint256 coll;
        uint256 stake;
        Status status;
        uint128 arrayIndex;
        uint256 activeInterestIndex;
    }

    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

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
        _pendingCollReward = collReward;
        _pendingDebtReward = debtReward;
    }

    function setUserTrove(address account, uint256 coll, uint256 debt) public {
        Troves[account] = Trove(debt, coll, 0, Status.active, 0, 0);
    }

    function getEntireDebtAndColl(
        address _borrower
    )
        public
        view
        returns (
            uint256 debt,
            uint256 coll,
            uint256 pendingDebtReward,
            uint256 pendingCollateralReward
        )
    {
        Trove memory t = Troves[_borrower];
        return (
            t.debt + _pendingDebtReward,
            t.coll + _pendingCollReward,
            _pendingDebtReward,
            _pendingCollReward
        );
    }

    function movePendingTroveRewardsToActiveBalances(
        uint256 _debt,
        uint256 _collateral
    ) public {}

    function closeTroveByLiquidation(address _borrower) public {}

    function applyPendingRewards(
        address /*_borrower*/
    ) public view returns (uint256 coll, uint256 debt) {
        return (_pendingCollReward, _pendingDebtReward);
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

    function setSortedTroves(address value) public {
        sortedTroves = SortedTroves(value);
    }

    function setNICR(address id, uint256 value) public {
        idToNICR[id] = value;
    }

    function setICR(address id, uint256 value) public {
        idToICR[id] = value;
    }

    function getNominalICR(address _borrower) external view returns (uint256) {
        return idToNICR[_borrower];
    }

    function insert(
        address _id,
        uint256 _NICR,
        address _prevId,
        address _nextId
    ) external {
        sortedTroves.insert(_id, _NICR, _prevId, _nextId);
    }

    function remove(address _id) external {
        sortedTroves.remove(_id);
    }

    function reInsert(
        address _id,
        uint256 _newNICR,
        address _prevId,
        address _nextId
    ) external {
        sortedTroves.reInsert(_id, _newNICR, _prevId, _nextId);
    }

    function addCollateralSurplus(
        address borrower,
        uint256 collSurplus
    ) public {}

    function updateBalances() public {}

    function setTroveOwnersCount(uint256 value) public {
        troveOwnersCount = value;
    }

    function getTroveOwnersCount() public view returns (uint256) {
        return troveOwnersCount;
    }

    function fetchPrice() external returns (uint256) {
        return price;
    }

    function getCurrentICR(
        address _borrower,
        uint256 /*_price*/
    ) external view returns (uint256) {
        return idToICR[_borrower];
    }

    function finalizeLiquidation(
        address _liquidator,
        uint256 _debt,
        uint256 _coll,
        uint256 _collSurplus,
        uint256 _debtGasComp,
        uint256 _collGasComp
    ) public {}

    function decreaseDebtAndSendCollateral(
        address account,
        uint256 debt,
        uint256 coll
    ) public {}

    function collateralToken() public view returns (address) {
        return address(0);
    }

    function getTroveStatus(address _borrower) public view returns (uint256) {
        return uint256(Troves[_borrower].status);
    }
}
