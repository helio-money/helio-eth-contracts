// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../interfaces/IListaCore.sol";

/**
    @title Lista System Start Time
    @dev Provides a unified `startTime` and `getWeek`, used for emissions.
 */
contract SystemStart is Initializable {
    uint256 startTime;

    function __SystemStart_init(address listaCore) internal onlyInitializing {
        startTime = IListaCore(listaCore).startTime();
    }

    function getWeek() public view returns (uint256 week) {
        return (block.timestamp - startTime) / 1 weeks;
    }
}
