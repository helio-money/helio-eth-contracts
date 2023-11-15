// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IListaCore.sol";

/**
    @title Lista System Start Time
    @dev Provides a unified `startTime` and `getWeek`, used for emissions.
 */
contract SystemStart {
    uint256 immutable startTime;

    constructor(address listaCore) {
        startTime = IListaCore(listaCore).startTime();
    }

    function getWeek() public view returns (uint256 week) {
        return (block.timestamp - startTime) / 1 weeks;
    }
}
