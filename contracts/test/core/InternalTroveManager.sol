// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/ISortedTroves.sol";
import "../../interfaces/IBorrowerOperations.sol";
import "../../core/TroveManager.sol";

contract InternalTroveManager is TroveManager {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public storedPendingReward;
    uint32[7][65535] private totalMints;

    constructor(
        address _listaCore,
        address _gasPoolAddress,
        address _debtTokenAddress,
        address _borrowerOperationsAddress,
        address _vault,
        address _liquidationManager,
        uint256 _gasCompensation
    )
        TroveManager(
            _listaCore,
            _gasPoolAddress,
            _debtTokenAddress,
            _borrowerOperationsAddress,
            _vault,
            _liquidationManager,
            _gasCompensation
        )
    {}

    function setLastUpdate(uint32 value) public {
        lastUpdate = value;
    }

    function setRewardRate(uint128 value) public {
        rewardRate = value;
    }

    function setTotalStakes(uint256 value) public {
        totalStakes = value;
    }

    function setDailyMintReward(uint32 week, uint256 value) public {
        dailyMintReward[week] = value;
    }

    function setAccountLatestMint(
        address account,
        uint32 amount,
        uint32 week,
        uint32 day
    ) public {
        accountLatestMint[account] = VolumeData(amount, week, day);
    }

    function setSurplusBalances(address account, uint256 value) public {
        surplusBalances[account] = value;
    }

    function setDefaultedCollAndDebt(uint256 coll, uint256 debt) public {
        defaultedCollateral = coll;
        defaultedDebt = debt;
    }

    function setStoredPendingReward(address account, uint256 amount) public {
        storedPendingReward[account] = amount;
    }

    function setTrove(
        address account,
        uint256 coll,
        uint256 debt,
        uint256 stake,
        Status status,
        uint256 interestIndex
    ) public {
        Trove memory t = Trove(debt, coll, stake, status, 0, interestIndex);
        Troves[account] = t;
    }

    function setRewardSnapshots(
        address account,
        uint256 coll,
        uint256 debt
    ) public {
        rewardSnapshots[account].collateral = coll;
        rewardSnapshots[account].debt = debt;
    }

    function setLValues(uint256 L_coll, uint256 L_d) public {
        L_collateral = L_coll;
        L_debt = L_d;
    }

    function setMinuteDecayFactor(uint256 value) public {
        minuteDecayFactor = value;
    }

    function setBaseRate(uint256 value) public {
        baseRate = value;
    }

    function setLastFeeOperationTime(uint256 value) public {
        lastFeeOperationTime = value;
    }

    function setLastActiveIndexUpdate(uint256 value) public {
        lastActiveIndexUpdate = value;
    }

    function setInterestRate(uint256 value) public {
        interestRate = value;
    }

    function setActiveInterestIndex(uint256 value) public {
        activeInterestIndex = value;
    }

    function setTotalActiveDebt(uint256 value) public {
        totalActiveDebt = value;
    }

    function setTotalActiveColl(uint256 value) public {
        totalActiveCollateral = value;
    }

    function setInterestPayable(uint256 value) public {
        interestPayable = value;
    }

    function updateBaseRateFromRedemption(
        uint256 _collateralDrawn,
        uint256 _price,
        uint256 _totalDebtSupply
    ) public returns (uint256) {
        return
            super._updateBaseRateFromRedemption(
                _collateralDrawn,
                _price,
                _totalDebtSupply
            );
    }

    function calcRedemptionRate(
        uint256 _baseRate
    ) public view returns (uint256) {
        return super._calcRedemptionRate(_baseRate);
    }

    function calcRedemptionFee(
        uint256 _redemptionRate,
        uint256 _collateralDrawn
    ) public pure returns (uint256) {
        return super._calcRedemptionFee(_redemptionRate, _collateralDrawn);
    }

    function calcBorrowingRate(
        uint256 _baseRate
    ) public view returns (uint256) {
        return super._calcBorrowingRate(_baseRate);
    }

    function calcBorrowingFee(
        uint256 _borrowingRate,
        uint256 _debt
    ) public pure returns (uint256) {
        return super._calcBorrowingFee(_borrowingRate, _debt);
    }

    function updateLastFeeOpTime() public {
        super._updateLastFeeOpTime();
    }

    function calcDecayedBaseRate() public view returns (uint256) {
        return super._calcDecayedBaseRate();
    }

    function redeemCollateralFromTrove(
        ISortedTroves _sortedTrovesCached,
        address _borrower,
        uint256 _maxDebtAmount,
        uint256 _price,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR
    ) public returns (SingleRedemptionValues memory singleRedemption) {
        return
            super._redeemCollateralFromTrove(
                _sortedTrovesCached,
                _borrower,
                _maxDebtAmount,
                _price,
                _upperPartialRedemptionHint,
                _lowerPartialRedemptionHint,
                _partialRedemptionHintNICR
            );
    }

    function redeemCloseTrove(
        address _borrower,
        uint256 _debt,
        uint256 _collateral
    ) public {
        super._redeemCloseTrove(_borrower, _debt, _collateral);
    }

    function isValidFirstRedemptionHint(
        ISortedTroves _sortedTroves,
        address _firstRedemptionHint,
        uint256 _price,
        uint256 _MCR
    ) public view returns (bool) {
        return
            super._isValidFirstRedemptionHint(
                _sortedTroves,
                _firstRedemptionHint,
                _price,
                _MCR
            );
    }

    function innerClaimReward(address account) public returns (uint256) {
        return super._claimReward(account);
    }

    function setPeriodFinish(uint32 value) public {
        periodFinish = value;
    }

    function getPendingMintReward(
        address account
    ) public view returns (uint256 amount) {
        return super._getPendingMintReward(account);
    }

    function updateIntegrals(
        address account,
        uint256 balance,
        uint256 supply
    ) public {
        super._updateIntegrals(account, balance, supply);
    }

    function updateIntegralForAccount(
        address account,
        uint256 balance,
        uint256 currentIntegral
    ) public {
        super._updateIntegralForAccount(account, balance, currentIntegral);
    }

    function updateRewardIntegral(
        uint256 supply
    ) public returns (uint256 integral) {
        return super._updateRewardIntegral(supply);
    }

    function fetchRewards(uint256 _periodFinish) public {
        super._fetchRewards(_periodFinish);
    }

    function privateResetState() public {
        if (TroveOwners.length == 0) {
            activeInterestIndex = INTEREST_PRECISION;
            lastActiveIndexUpdate = block.timestamp;
            totalStakes = 0;
            totalStakesSnapshot = 0;
            totalCollateralSnapshot = 0;
            L_collateral = 0;
            L_debt = 0;
            lastCollateralError_Redistribution = 0;
            lastDebtError_Redistribution = 0;
            totalActiveCollateral = 0;
            totalActiveDebt = 0;
            defaultedCollateral = 0;
            defaultedDebt = 0;
        }
    }

    function updateMintVolume(address account, uint256 initialAmount) public {
        super._updateMintVolume(account, initialAmount);
    }

    function decayBaseRate() public returns (uint256) {
        return super._decayBaseRate();
    }

    function updateTroveRewardSnapshots(address _borrower) public {
        super._updateTroveRewardSnapshots(_borrower);
    }

    function removeStake(address _borrower) public {
        super._removeStake(_borrower);
    }

    function innerUpdateStakeAndTotalStakes(
        address _borrower
    ) public returns (uint256) {
        Trove storage t = Troves[_borrower];
        return super._updateStakeAndTotalStakes(t);
    }

    function computeNewStake(uint256 _coll) public view returns (uint256) {
        return super._computeNewStake(_coll);
    }

    function movePendingTroveRewardsToActiveBalance(
        uint256 _debt,
        uint256 _collateral
    ) public {
        super._movePendingTroveRewardsToActiveBalance(_debt, _collateral);
    }

    function redistributeDebtAndColl(uint256 _debt, uint256 _coll) public {
        super._redistributeDebtAndColl(_debt, _coll);
    }

    function privateSendCollateral(address _account, uint256 _amount) public {
        if (_amount > 0) {
            totalActiveCollateral = totalActiveCollateral - _amount;
            emit CollateralSent(_account, _amount);

            collateralToken.safeTransfer(_account, _amount);
        }
    }

    function privateSendCollateralInETH(
        address _account,
        uint256 _amount
    ) public {
        if (_amount > 0) {
            totalActiveCollateral = totalActiveCollateral - _amount;
            emit CollateralSent(_account, _amount);

            // Send collateral wBETH to BorrowerOperations and need to check if ETH withdraw is possible
            uint256 ethAmount = IBorrowerOperations(borrowerOperationsAddress)
                .getETHAmount(_amount);
            if (borrowerOperationsAddress.balance >= ethAmount) {
                // Direct ETH withdraw
                collateralToken.safeTransfer(
                    borrowerOperationsAddress,
                    _amount
                );
                IBorrowerOperations(borrowerOperationsAddress)
                    .withdrawCollInETH(_account, ethAmount);
            } else {
                // wBETH withdraw
                collateralToken.safeTransfer(_account, _amount);
            }
        }
    }

    function increaseDebt(
        address account,
        uint256 netDebtAmount,
        uint256 debtAmount
    ) public {
        super._increaseDebt(account, netDebtAmount, debtAmount);
    }

    function decreaseDebt(address account, uint256 amount) public {
        super._decreaseDebt(account, amount);
    }

    function accrueActiveInterests() public returns (uint256) {
        return super._accrueActiveInterests();
    }

    function calculateInterestIndex()
        public
        view
        returns (uint256 currentInterestIndex, uint256 interestFactor)
    {
        return super._calculateInterestIndex();
    }

    function requireCallerIsBO() public view {
        super._requireCallerIsBO();
    }

    function requireCallerIsLM() public view {
        super._requireCallerIsLM();
    }
}
