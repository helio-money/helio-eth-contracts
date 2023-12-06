// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../core/StabilityPool.sol";

contract InternalStabilityPool is StabilityPool {
    constructor(
        address _listaCore,
        IDebtToken _debtTokenAddress,
        IListaVault _vault,
        address _factory,
        address _liquidationManager
    )
        StabilityPool(
            _listaCore,
            _debtTokenAddress,
            _vault,
            _factory,
            _liquidationManager
        )
    {}

    function setCollateralGainsByDepositor(
        address depositor,
        uint256 index,
        uint80 gain
    ) public {
        collateralGainsByDepositor[depositor][index] = gain;
    }

    function getSunsetIndex(
        uint16 index
    ) public view returns (SunsetIndex memory) {
        return _sunsetIndexes[index];
    }

    function getQueue() public view returns (Queue memory) {
        return queue;
    }

    function setCurrentEpoch(uint128 epoch) public {
        currentEpoch = epoch;
    }

    function setCurrentScale(uint128 scale) public {
        currentScale = scale;
    }

    function getCollateralLength() public view returns (uint256) {
        return collateralTokens.length;
    }

    function putDepositSnapshots(
        address depositor,
        Snapshots calldata snapshots
    ) public {
        depositSnapshots[depositor] = snapshots;
    }

    function setP(uint256 newP) public {
        P = newP;
    }

    function setScale(uint128 newScale) public {
        currentScale = newScale;
    }

    function setEpoch(uint128 newEpoch) public {
        currentEpoch = newEpoch;
    }

    function setAccountDeposits(
        address depositor,
        AccountDeposit calldata data
    ) public {
        accountDeposits[depositor] = data;
    }

    function setDepositSnapshots(
        address depositor,
        Snapshots calldata data
    ) public {
        depositSnapshots[depositor] = data;
    }

    function setEpochToScaleToG(
        uint128 epoch,
        uint128 scale,
        uint256 G
    ) public {
        epochToScaleToG[epoch][scale] = G;
    }

    function setEpochToScaleToSums(
        uint128 epoch,
        uint128 scale,
        uint256 index,
        uint256 S
    ) public {
        epochToScaleToSums[epoch][scale][index] = S;
    }

    function setDepositSums(
        address depositor,
        uint256 index,
        uint256 sum
    ) public {
        depositSums[depositor][index] = sum;
    }

    function overwriteCollateral(IERC20 _newCollateral, uint256 idx) public {
        super._overwriteCollateral(_newCollateral, idx);
    }

    function triggerRewardIssuance() public {
        super._triggerRewardIssuance();
    }

    function vestedEmissions() public view returns (uint256) {
        return super._vestedEmissions();
    }

    function setPeriodFinish(uint32 _periodFinish) public {
        periodFinish = _periodFinish;
    }

    function setLastUpdate(uint32 _lastUpdate) public {
        lastUpdate = _lastUpdate;
    }

    function setRewardRate(uint128 rate) public {
        rewardRate = rate;
    }

    function updateG(uint256 _listaIssuance) public {
        super._updateG(_listaIssuance);
    }

    function computeListaPerUnitStaked(
        uint256 _listaIssuance,
        uint256 _totalDebtTokenDeposits
    ) public returns (uint256) {
        return
            super._computeListaPerUnitStaked(
                _listaIssuance,
                _totalDebtTokenDeposits
            );
    }

    function setLastListaError(uint256 error) public {
        lastListaError = error;
    }

    function accrueDepositorCollateralGain(
        address _depositor
    ) public returns (bool hasGains) {
        uint80[256] storage depositorGains = collateralGainsByDepositor[
            _depositor
        ];
        uint256 collaterals = collateralTokens.length;
        uint256 initialDeposit = accountDeposits[_depositor].amount;
        hasGains = false;
        if (initialDeposit == 0) {
            return hasGains;
        }

        uint128 epochSnapshot = depositSnapshots[_depositor].epoch;
        uint128 scaleSnapshot = depositSnapshots[_depositor].scale;
        uint256 P_Snapshot = depositSnapshots[_depositor].P;

        uint256[256] storage sums = epochToScaleToSums[epochSnapshot][
            scaleSnapshot
        ];
        uint256[256] storage nextSums = epochToScaleToSums[epochSnapshot][
            scaleSnapshot + 1
        ];
        uint256[256] storage depSums = depositSums[_depositor];

        for (uint256 i = 0; i < collaterals; i++) {
            if (sums[i] == 0) continue; // Collateral was overwritten or not gains
            hasGains = true;
            uint256 firstPortion = sums[i] - depSums[i];
            uint256 secondPortion = nextSums[i] / SCALE_FACTOR;
            depositorGains[i] += uint80(
                (initialDeposit * (firstPortion + secondPortion)) /
                    P_Snapshot /
                    DECIMAL_PRECISION
            );
        }
        return (hasGains);
    }

    function setTotalDebtTokenDeposit(uint256 value) public {
        totalDebtTokenDeposits = value;
    }

    function setLastDebtLossError_Offset(uint256 value) public {
        lastDebtLossError_Offset = value;
    }

    function setLastCollateralError_Offset(
        uint256 index,
        uint256 value
    ) public {
        lastCollateralError_Offset[index] = value;
    }

    event TestResult(uint256 value1, uint256 value2);

    function computeRewardsPerUnitStaked(
        uint256 _collToAdd,
        uint256 _debtToOffset,
        uint256 _totalDebtTokenDeposits,
        uint256 idx
    )
        public
        returns (
            uint256 collateralGainPerUnitStaked,
            uint256 debtLossPerUnitStaked
        )
    {
        (collateralGainPerUnitStaked, debtLossPerUnitStaked) = super
            ._computeRewardsPerUnitStaked(
                _collToAdd,
                _debtToOffset,
                _totalDebtTokenDeposits,
                idx
            );
        emit TestResult(collateralGainPerUnitStaked, debtLossPerUnitStaked);
    }

    function updateRewardSumAndProduct(
        uint256 _collateralGainPerUnitStaked,
        uint256 _debtLossPerUnitStaked,
        uint256 idx
    ) public {
        super._updateRewardSumAndProduct(
            _collateralGainPerUnitStaked,
            _debtLossPerUnitStaked,
            idx
        );
    }

    function decreaseDebt(uint256 _amount) public {
        super._decreaseDebt(_amount);
    }

    function getListaGainFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) public view returns (uint256) {
        return super._getListaGainFromSnapshots(initialStake, snapshots);
    }

    function getCompoundedStakeFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) public view returns (uint256) {
        return super._getCompoundedStakeFromSnapshots(initialStake, snapshots);
    }

    function updateSnapshots(address _depositor, uint256 _newValue) public {
        super._updateSnapshots(_depositor, _newValue);
    }

    function accrueRewards(address _depositor) public {
        super._accrueRewards(_depositor);
    }

    function innerClaimReward(address account) public returns (uint256 amount) {
        return super._claimReward(account);
    }

    function privateClaimableReward(
        address _depositor
    ) public view returns (uint256) {
        uint256 initialDeposit = accountDeposits[_depositor].amount;
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        return super._getListaGainFromSnapshots(initialDeposit, snapshots);
    }

    function setCollateralGains(
        address depositor,
        uint256 index,
        uint80 gain
    ) public {
        collateralGainsByDepositor[depositor][index] = gain;
    }

    function privateAccrueDepositorCollateralGain(
        address _depositor
    ) public returns (bool hasGains) {
        uint80[256] storage depositorGains = collateralGainsByDepositor[
            _depositor
        ];
        uint256 collaterals = collateralTokens.length;
        uint256 initialDeposit = accountDeposits[_depositor].amount;
        hasGains = false;
        if (initialDeposit == 0) {
            return hasGains;
        }

        uint128 epochSnapshot = depositSnapshots[_depositor].epoch;
        uint128 scaleSnapshot = depositSnapshots[_depositor].scale;
        uint256 P_Snapshot = depositSnapshots[_depositor].P;

        uint256[256] storage sums = epochToScaleToSums[epochSnapshot][
            scaleSnapshot
        ];
        uint256[256] storage nextSums = epochToScaleToSums[epochSnapshot][
            scaleSnapshot + 1
        ];
        uint256[256] storage depSums = depositSums[_depositor];

        for (uint256 i = 0; i < collaterals; i++) {
            if (sums[i] == 0) continue; // Collateral was overwritten or not gains
            hasGains = true;
            uint256 firstPortion = sums[i] - depSums[i];
            uint256 secondPortion = nextSums[i] / SCALE_FACTOR;
            depositorGains[i] += uint80(
                (initialDeposit * (firstPortion + secondPortion)) /
                    P_Snapshot /
                    DECIMAL_PRECISION
            );
        }
        return (hasGains);
    }
}
