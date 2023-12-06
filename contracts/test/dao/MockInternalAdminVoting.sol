// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;
import "../../dao/AdminVoting.sol";

/**
 * @title MockInternalAdminVoting
 * @notice Wrapper around AdminVoting contract for testing purposes.
 */
contract MockInternalAdminVoting is AdminVoting {
    // For testing purposes, vote to change this value
    uint256 public mutableNum = 0;

    constructor(
        address _listaCore,
        ITokenLocker _tokenLocker,
        uint256 _minCreateProposalPct,
        uint256 _passingPct,
        uint256 _bootstrapFinish
    )
        AdminVoting(
            _listaCore,
            _tokenLocker,
            _minCreateProposalPct,
            _passingPct,
            _bootstrapFinish
        )
    {}

    function _isSetGuardianPayloadInternal(
        uint256 payloadLength,
        Action memory action
    ) public view returns (bool) {
        return super._isSetGuardianPayload(payloadLength, action);
    }

    function getProposalDataById(
        uint256 id
    ) public view returns (Proposal memory) {
        return proposalData[id];
    }

    function setMutableNum(uint256 _num) public {
        mutableNum = _num;
    }
}
