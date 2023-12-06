// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract MockListaCore {
    address public owner;
    address public guardian;
    uint256 public startTime;
    bool public paused;
    address public feeReceiver;

    function setOwner(address _owner) public {
        owner = _owner;
    }

    function setGuardian(address _guardian) public {
        guardian = _guardian;
    }

    function setStartTime(uint256 _startTime) public {
        startTime = _startTime;
    }

    function setPaused(bool _paused) public {
        paused = _paused;
    }

    function setFeeReceiver(address value) public {
        feeReceiver = value;
    }
}
