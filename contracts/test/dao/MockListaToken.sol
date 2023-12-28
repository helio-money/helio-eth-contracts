// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;
import "../../dao/ListaToken.sol";

contract MockListaToken is ListaToken {
    constructor(
        address _vault,
        address _layerZeroEndpoint,
        address _locker
    ) ListaToken(_vault, _layerZeroEndpoint, _locker) {}

    function _approveInternal(
        address owner,
        address spender,
        uint256 amount
    ) public {
        _approve(owner, spender, amount);
    }

    function _mintInternal(address account, uint256 amount) public {
        _mint(account, amount);
    }
}
