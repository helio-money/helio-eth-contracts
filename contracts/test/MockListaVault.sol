// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dao/ListaVault.sol";
import "./InternalStabilityPool.sol";

contract MockListaVault {
    uint256 public emissionAmount;

    function setEmissionAmount(uint256 amount) public {
        emissionAmount = amount;
    }

    function allocateNewEmissions(uint256) external returns (uint256) {
        return emissionAmount;
    }

    function vaultClaimReward(InternalStabilityPool stabilityPool, address claimant) public returns (uint256){
        return stabilityPool.vaultClaimReward(claimant, address(0));
    }
}
