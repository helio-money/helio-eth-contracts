// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IListaCore.sol";

/**
    @title Lista Ownable
    @notice Contracts inheriting `ListaOwnable` have the same owner as `ListaCore`.
            The ownership cannot be independently modified or renounced.
 */
contract ListaOwnable {
    IListaCore public immutable LISTA_CORE;

    constructor(address _listaCore) {
        LISTA_CORE = IListaCore(_listaCore);
    }

    modifier onlyOwner() {
        require(msg.sender == LISTA_CORE.owner(), "Only owner");
        _;
    }

    function owner() public view returns (address) {
        return LISTA_CORE.owner();
    }

    function guardian() public view returns (address) {
        return LISTA_CORE.guardian();
    }
}
