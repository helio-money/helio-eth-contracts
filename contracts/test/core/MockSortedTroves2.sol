// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {InternalTroveManager} from "./InternalTroveManager.sol";

contract MockSortedTroves2 {
    address public first;
    address public last;
    InternalTroveManager public troveManager;
    mapping(address => Node) public nodes;
    address[] public list;

    struct Node {
        bool exists;
        uint256 NICR;
        address nextId; // Id of next node (smaller NICR) in the list
        address prevId; // Id of previous node (larger NICR) in the list
    }

    function setAddresses(address _troveManagerAddress) external {
        troveManager = InternalTroveManager(_troveManagerAddress);
    }

    function insert(
        address _id,
        uint256 _NICR,
        address _prevId,
        address _nextId
    ) public {
        if (!nodes[_id].exists) {
            list.push(_id);
        }
        nodes[_id] = Node(true, _NICR, _nextId, _prevId);
    }

    function reInsert(
        address _id,
        uint256 _newNICR,
        address _prevId,
        address _nextId
    ) public {
        insert(_id, _newNICR, _prevId, _nextId);
    }

    function remove(address _id) public {
        if (list.length == 0) {
            return;
        }

        if (list.length > 1) {
            for (uint i; i < list.length; ++i) {
                if (list[i] == _id) {
                    list[i] = list[list.length - 1];
                    break;
                }
            }
        }
        list.pop();

        Node memory node = nodes[_id];
        delete nodes[_id];
    }

    function contains(address _id) public view returns (bool) {
        return nodes[_id].exists;
    }

    function isEmpty() public view returns (bool) {
        return list.length == 0;
    }

    function getSize() external view returns (uint256) {
        return list.length;
    }

    function getFirst() external view returns (address) {
        if (list.length > 0) {
            return list[0];
        }
        return address(0);
    }

    function getLast() external view returns (address) {
        if (list.length > 0) {
            return list[list.length - 1];
        }
        return address(0);
    }

    function getNext(address _id) external view returns (address) {
        return nodes[_id].nextId;
    }

    function getPrev(address _id) external view returns (address) {
        return nodes[_id].prevId;
    }
}
