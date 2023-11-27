// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IwBETH is IERC20 {
    function deposit(address referral) external payable;

    function exchangeRate() external view returns (uint256);
}
