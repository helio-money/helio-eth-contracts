// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../interfaces/IVault.sol";

/**
 * @title MockEmissionReceiver
 * @notice Mock contract for testing purposes.
 */
contract MockEmissionReceiver {
    event RegisteredIdNotified(uint256[] assignedIds);

    IListaVault public vault;

    function notifyRegisteredId(
        uint256[] memory assignedIds
    ) public returns (bool) {
        emit RegisteredIdNotified(assignedIds);
        return true;
    }

    function setVault(IListaVault _vault) external {
        vault = _vault;
    }

    function allocateNewEmissions(uint256 id) external returns (uint256) {
        return vault.allocateNewEmissions(id);
    }

    function transferAllocatedTokens(
        address claimant,
        address receiver,
        uint256 amount
    ) external returns (bool) {
        return vault.transferAllocatedTokens(claimant, receiver, amount);
    }

    function vaultClaimReward(
        address claimant,
        address receiver
    ) public returns (uint256) {
        return 1e18;
    }

    function claimableReward(address account) external view returns (uint256) {
        return 1e18;
    }

    function batchClaimRewards(
        address receiver,
        address boostDelegate,
        address[] calldata rewardContracts,
        uint256 maxFeePct
    ) external returns (bool) {
        return
            vault.batchClaimRewards(
                receiver,
                boostDelegate,
                rewardContracts,
                maxFeePct
            );
    }
}
