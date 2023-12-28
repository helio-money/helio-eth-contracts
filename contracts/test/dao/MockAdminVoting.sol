// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../interfaces/IListaCore.sol";

contract MockAdminVoting {
    event ProposalExecuted(uint256 value);
    IListaCore public listaCore;

    function setListaCore(address _listaCore) public {
        listaCore = IListaCore(_listaCore);
    }

    function acceptTransferOwnership() public {
        listaCore.acceptTransferOwnership();
    }

    function executeByProposal(uint256 value) public {
        emit ProposalExecuted(value);
    }
}
