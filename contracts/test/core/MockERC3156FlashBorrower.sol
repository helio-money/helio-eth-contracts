// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import "../../core/DebtToken.sol";

contract MockERC3156FlashBorrower is IERC3156FlashBorrower {
    bytes32 public returnValue;

    function setReturnValue(bytes32 value) public {
        returnValue = value;
    }

    function onFlashLoan(
        address /*initiator*/,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata /*data*/
    ) public returns (bytes32) {
        DebtToken(token).increaseAllowance(token, amount + fee);
        return returnValue;
    }
}
