// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../dao/ListaVault.sol";
import "../core/InternalStabilityPool.sol";

contract MockListaVault {
    uint256 public emissionAmount;
    IEmissionSchedule public emissionSchedule;
    IIncentiveVoting public incentiveVoting;

    function setEmissionAmount(uint256 amount) public {
        emissionAmount = amount;
    }

    function allocateNewEmissions(uint256) external view returns (uint256) {
        return emissionAmount;
    }

    function vaultClaimReward(
        InternalStabilityPool stabilityPool,
        address claimant
    ) public returns (uint256) {
        return stabilityPool.vaultClaimReward(claimant, address(0));
    }

    function setEmissionSchedule(IEmissionSchedule _emissionSchedule) public {
        emissionSchedule = _emissionSchedule;
    }

    function getTotalWeeklyEmissions(
        uint256 week,
        uint256 unallocatedTotal
    ) public returns (uint256 amount, uint256 lock) {
        return emissionSchedule.getTotalWeeklyEmissions(week, unallocatedTotal);
    }

    function setIncentiveVoting(address _incentiveVoting) public {
        incentiveVoting = IIncentiveVoting(_incentiveVoting);
    }

    function registerNewReceiver() external {
        // ensure the stability pool is registered with receiver ID 0
        incentiveVoting.registerNewReceiver();
    }
}
