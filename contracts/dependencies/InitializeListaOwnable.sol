// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../interfaces/IListaCore.sol";

/**
    @title Lista Ownable
    @notice Contracts inheriting `ListaOwnable` have the same owner as `ListaCore`.
            The ownership cannot be independently modified or renounced.
 */
contract InitializeListaOwnable is Initializable {
    IListaCore public LISTA_CORE;

    function __ListaOwnable_init(address _listaCore) internal onlyInitializing {
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
