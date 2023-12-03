// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;
import "../dao/TokenLocker.sol";

/**
 * @title MockInternalTokenLocker
 * @notice Wrapper around TokenLocker contract for testing purposes.
 */
contract MockInternalTokenLocker is TokenLocker {
    constructor(
        address _listaCore,
        IListaToken _token,
        IIncentiveVoting _voter,
        address _manager,
        uint256 _lockToTokenRatio
    ) TokenLocker(_listaCore, _token, _voter, _manager, _lockToTokenRatio) {}

    function _lockInternal(
        address _account,
        uint256 _amount,
        uint256 _weeks
    ) public {
        super._lock(_account, _amount, _weeks);
    }

    function _weeklyWeightWriteInternal(
        address account
    ) public returns (uint256 weight) {
        return super._weeklyWeightWrite(account);
    }

    function getAccountLockData(
        address _account
    ) public view returns (AccountData memory) {
        return accountLockData[_account];
    }

    function getTotalWeeklyWeight(
        uint16 week
    ) public view returns (uint40 weight) {
        return totalWeeklyWeights[week];
    }

    function getTotalWeeklyUnlocks(
        uint16 week
    ) public view returns (uint40 unlocks) {
        return totalWeeklyUnlocks[week];
    }

    function getAccountWeeklyWeight(
        address _account,
        uint16 week
    ) public view returns (uint40 weight) {
        return accountWeeklyWeights[_account][week];
    }

    function getAccountWeeklyUnlocks(
        address _account,
        uint16 week
    ) public view returns (uint40 unlocks) {
        return accountWeeklyUnlocks[_account][week];
    }
}
