// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract MockStabilityPool {
    uint256 public totalDebt;

    function setTotalDebt(uint256 value) public {
        totalDebt = value;
    }

    function getTotalDebtTokenDeposits() public view returns (uint256) {
        return totalDebt;
    }

    function offset(
        address collateral,
        uint256 _debtToOffset,
        uint256 _collToAdd
    ) public {}

    mapping(address => bool) public enabledColls;

    function enableCollateral(address _collateral) public {
        enabledColls[_collateral] = true;
    }
}
