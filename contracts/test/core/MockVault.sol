// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InternalTroveManager} from "./InternalTroveManager.sol";

contract MockVault {
    IERC20 public rewardToken;
    InternalTroveManager public troveManager;
    mapping(uint256 => uint256) emissionConfig;

    constructor(address token) {
        rewardToken = IERC20(token);
    }

    function setTroveManager(InternalTroveManager manager) public {
        troveManager = manager;
    }

    function transferAllocatedTokens(
        address claimant,
        address receiver,
        uint256 amount
    ) public returns (bool) {
        return rewardToken.transfer(receiver, amount);
    }

    function notifyRegisteredId(
        uint256[] calldata _assignedIds
    ) public returns (bool) {
        return troveManager.notifyRegisteredId(_assignedIds);
    }

    function vaultClaimReward(
        address claimant,
        address
    ) public returns (uint256) {
        return troveManager.vaultClaimReward(claimant, address(0));
    }

    function setEmissionAmount(uint256 id, uint256 value) public {
        emissionConfig[id] = value;
    }

    function allocateNewEmissions(uint256 id) external returns (uint256) {
        return emissionConfig[id];
    }
}
