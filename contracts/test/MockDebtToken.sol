// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./InternalStabilityPool.sol";

contract MockDebtToken is ERC20 {
    uint256 public emissionAmount;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1e18 ether);
    }

    function sendToSP(address from, uint256 amount) public {
        super._transfer(from, msg.sender, amount);
    }

    function setEmissionAmount(uint256 amount) public {
        emissionAmount = amount;
    }

    function allocateNewEmissions(uint256 /*id*/) external returns (uint256) {
        return emissionAmount;
    }

    function transferAllocatedTokens(address claimant, address receiver, uint256 amount) external returns (bool) {
        super._transfer(claimant, receiver, amount);
        return true;
    }

    function returnFromPool(address _poolAddress, address _receiver, uint256 _amount) external {
        _transfer(_poolAddress, _receiver, _amount);
    }

    function vaultClaimReward(InternalStabilityPool stabilityPool, address claimant) public returns (uint256){
        return stabilityPool.vaultClaimReward(claimant, address(0));
    }
}
