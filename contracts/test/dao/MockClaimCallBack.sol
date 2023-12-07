// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../dao/AirdropDistributor.sol";

contract MockClaimCallBack {
    event CallbackClaimed(address claimant, uint256 amount);

    constructor() {}

    function claimCallback(
        address claimant,
        uint256 amount
    ) external returns (bool success) {
        emit CallbackClaimed(claimant, amount);
        return true;
    }
}
