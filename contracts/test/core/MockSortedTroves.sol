// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract MockSortedTroves {
    address public last;
    mapping(address => address) prevIds;
    mapping(address => address) nextIds;

    function setLast(address value) public {
        last = value;
    }

    function getLast() external view returns (address) {
        return last;
    }

    function setPrevId(address id, address prevId) public {
        prevIds[id] = prevId;
        nextIds[prevId] = id;
    }

    function setNextId(address id, address nextId) public {
        prevIds[nextId] = id;
        nextIds[id] = nextId;
    }

    function getPrev(address _id) external view returns (address) {
        return prevIds[_id];
    }

    function remove(address _id) public {
        address prev = prevIds[_id];
        address next = nextIds[_id];

        nextIds[prev] = next;
        prevIds[next] = prev;
        if (last == _id) {
            last = prev;
        }
    }

    address public troveManager;

    function setAddresses(address _troveManagerAddress) public {
        troveManager = _troveManagerAddress;
    }
}
