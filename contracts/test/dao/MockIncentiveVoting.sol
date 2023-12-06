// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/**
 * @title MockIncentiveVoting
 * @notice Mock contract for testing purposes.
 */
contract MockIncentiveVoting {
    mapping(address => uint16) public unfreezeData; // 0 = uncalled, 1 = false, 2 = true
    mapping(address => bool) public clearRegisteredWeightData; // false = uncalled, true = called

    function unfreeze(address account, bool keepVote) external returns (bool) {
        unfreezeData[account] = keepVote ? 2 : 1;
        return true;
    }

    function clearRegisteredWeight(address account) external returns (bool) {
        clearRegisteredWeightData[account] = true;
        return true;
    }
}
