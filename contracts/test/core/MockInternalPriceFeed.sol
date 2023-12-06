// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;
import "../../core/PriceFeed.sol";

contract MockInternalPriceFeed is PriceFeed {
    constructor(
        address listaCore,
        address ethFeed
    ) PriceFeed(listaCore, ethFeed) {}

    function processFeedResponses(
        address _token,
        OracleRecord memory oracle,
        FeedResponse memory _currResponse,
        FeedResponse memory _prevResponse,
        PriceRecord memory priceRecord
    ) public returns (uint256) {
        return
            super._processFeedResponses(
                _token,
                oracle,
                _currResponse,
                _prevResponse,
                priceRecord
            );
    }

    function calcEthPrice(uint256 ethAmount) public returns (uint256) {
        return super._calcEthPrice(ethAmount);
    }

    function fetchFeedResponses(
        IAggregatorV3Interface oracle,
        uint80 lastRoundId
    )
        public
        view
        returns (
            FeedResponse memory currResponse,
            FeedResponse memory prevResponse,
            bool updated
        )
    {
        return super._fetchFeedResponses(oracle, lastRoundId);
    }

    function isFeedWorking(
        FeedResponse memory _currentResponse,
        FeedResponse memory _prevResponse
    ) public view returns (bool) {
        return super._isFeedWorking(_currentResponse, _prevResponse);
    }

    function isValidResponse(
        FeedResponse memory _response
    ) public view returns (bool) {
        return super._isValidResponse(_response);
    }

    function isPriceChangeAboveMaxDeviation(
        FeedResponse memory _currResponse,
        FeedResponse memory _prevResponse,
        uint8 decimals
    ) public pure returns (bool) {
        return
            super._isPriceChangeAboveMaxDeviation(
                _currResponse,
                _prevResponse,
                decimals
            );
    }

    function scalePriceByDigits(
        uint256 _price,
        uint256 _answerDigits
    ) public pure returns (uint256) {
        return super._scalePriceByDigits(_price, _answerDigits);
    }

    function updateFeedStatus(
        address _token,
        OracleRecord memory _oracle,
        bool _isWorking
    ) public {
        super._updateFeedStatus(_token, _oracle, _isWorking);
    }

    function storePrice(
        address _token,
        uint256 _price,
        uint256 _timestamp,
        uint80 roundId
    ) public {
        super._storePrice(_token, _price, _timestamp, roundId);
    }

    function fetchCurrentFeedResponse(
        IAggregatorV3Interface _priceAggregator
    ) public view returns (FeedResponse memory response) {
        return super._fetchCurrentFeedResponse(_priceAggregator);
    }

    function fetchPrevFeedResponse(
        IAggregatorV3Interface _priceAggregator,
        uint80 _currentRoundId
    ) public view returns (FeedResponse memory prevResponse) {
        return super._fetchPrevFeedResponse(_priceAggregator, _currentRoundId);
    }

    function isPriceStale(
        uint256 _priceTimestamp,
        uint256 _heartbeat
    ) public view returns (bool) {
        return super._isPriceStale(_priceTimestamp, _heartbeat);
    }

    function timestamp() public view returns (uint256) {
        return block.timestamp;
    }
}
