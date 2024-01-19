// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CollateralToken is ERC20 {
    constructor() ERC20("CollateralToken", "CT") {}

    function mint(address _account, uint256 _amount) external {
        _mint(_account, _amount);
    }

    function exchangeRate() external pure returns (uint256) {
        return 1e18;
    }
}
