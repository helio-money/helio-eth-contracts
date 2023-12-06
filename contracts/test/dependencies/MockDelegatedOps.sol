// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../dependencies/DelegatedOps.sol";

/**
 * @title MockDelegatedOps
 * @notice Wrapper around MockDelegatedOps contract for testing purposes.
 */
contract MockDelegatedOps is DelegatedOps {
    function isCallerOrDelegated(
        address account
    ) public view callerOrDelegated(account) returns (bool) {
        return true;
    }
}
