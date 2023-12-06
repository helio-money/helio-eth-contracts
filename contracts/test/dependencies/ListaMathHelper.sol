// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../dependencies/ListaMath.sol";

/**
 * @title ListaMathHelper
 * @notice Wrapper around ListaMath library for testing purposes.
 */
contract ListaMathHelper {
    function _min(uint256 _a, uint256 _b) public pure returns (uint256) {
        return ListaMath._min(_a, _b);
    }

    function _max(uint256 _a, uint256 _b) public pure returns (uint256) {
        return ListaMath._max(_a, _b);
    }

    function decMul(uint256 x, uint256 y) public pure returns (uint256 decProd) {
        return ListaMath.decMul(x, y);
    }

    function _decPow(uint256 _base, uint256 _minutes) public pure returns (uint256) {
        return ListaMath._decPow(_base, _minutes);
    }

    function _getAbsoluteDifference(uint256 _a, uint256 _b) public pure returns (uint256) {
        return ListaMath._getAbsoluteDifference(_a, _b);
    }

    function _computeNominalCR(uint256 _coll, uint256 _debt) public pure returns (uint256) {
        return ListaMath._computeNominalCR(_coll, _debt);
    }

    function _computeCR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) public pure returns (uint256) {
        return ListaMath._computeCR(_coll, _debt, _price);
    }

    function _computeCR(uint256 _coll, uint256 _debt) public pure returns (uint256) {
        return ListaMath._computeCR(_coll, _debt);
    }
}
