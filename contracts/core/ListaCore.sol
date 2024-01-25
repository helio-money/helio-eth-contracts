// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/**
    @title Lista Core
    @notice Single source of truth for system-wide values and contract ownership.

            Ownership of this contract should be the Lista DAO via `AdminVoting`.
            Other ownable Lista contracts inherit their ownership from this contract
            using `ListaOwnable`.
 */
contract ListaCore {
    address public feeReceiver;
    address public priceFeed;

    address public owner;
    address public pendingOwner;
    uint256 public ownershipTransferDeadline;

    address public guardian;

    // We enforce a three day delay between committing and applying
    // an ownership change, as a sanity check on a proposed new owner
    // and to give users time to react in case the act is malicious.
    uint256 public constant OWNERSHIP_TRANSFER_DELAY = 86400 * 3;

    // System-wide pause. When true, disables trove adjustments across all collaterals.
    bool public paused;
    // Whitelist for contracts that are allowed to initiat the system-wide pause.
    mapping(address => uint) public whitelist;

    // System-wide start time, rounded down the nearest epoch week.
    // Other contracts that require access to this should inherit `SystemStart`.
    uint256 public immutable startTime;

    event NewOwnerCommitted(
        address owner,
        address pendingOwner,
        uint256 deadline
    );

    event NewOwnerAccepted(address oldOwner, address owner);

    event NewOwnerRevoked(address owner, address revokedOwner);

    event FeeReceiverSet(address feeReceiver);

    event PriceFeedSet(address priceFeed);

    event GuardianSet(address guardian);

    event Paused(address pauser);

    event Unpaused(address unpauser);

    constructor(
        address _owner,
        address _guardian,
        address _priceFeed,
        address _feeReceiver
    ) {
        owner = _owner;
        startTime = (block.timestamp / 1 weeks) * 1 weeks;
        guardian = _guardian;
        priceFeed = _priceFeed;
        feeReceiver = _feeReceiver;
        emit GuardianSet(_guardian);
        emit PriceFeedSet(_priceFeed);
        emit FeeReceiverSet(_feeReceiver);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @notice Set the receiver of all fees across the protocol
     * @param _feeReceiver Address of the fee's recipient
     */
    function setFeeReceiver(address _feeReceiver) external onlyOwner {
        feeReceiver = _feeReceiver;
        emit FeeReceiverSet(_feeReceiver);
    }

    /**
     * @notice Set the price feed used in the protocol
     * @param _priceFeed Price feed address
     */
    function setPriceFeed(address _priceFeed) external onlyOwner {
        priceFeed = _priceFeed;
        emit PriceFeedSet(_priceFeed);
    }

    /**
     * @notice Set the guardian address
               The guardian can execute some emergency actions
     * @param _guardian Guardian address
     */
    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianSet(_guardian);
    }

    /**
     * @notice Sets the global pause state of the protocol
     *         Pausing is used to mitigate risks in exceptional circumstances
     *         Functionalities affected by pausing are:
     *         - New borrowing is not possible
     *         - New collateral deposits are not possible
     *         - New stability pool deposits are not possible
     * @param _paused If true the protocol is paused
     */
    function setPaused(bool _paused) external {
        require(paused != _paused, "Already set");

        if (_paused) {
            require(msg.sender == owner || whitelist[msg.sender] == 1, "Only whitelisted or owner can pause");
            emit Paused(msg.sender);
        } else {
            require(msg.sender == owner || msg.sender == guardian, "Only guardian or owner can unpause");
            emit Unpaused(msg.sender);
        }

        paused = _paused;
    }

    /**
     * @notice Add addresses to the whitelist
     * @param users Addresses to add
     */
    function addToWhitelist(address[] memory users) external onlyOwner {
        for(uint256 i = 0; i < users.length; i++)
            whitelist[users[i]] = 1;
    }

    /**
     * @notice Remove addresses from the whitelist
     * @param users Addresses to remove
     */
    function removeFromWhitelist(address[] memory users) external onlyOwner {
        for(uint256 i = 0; i < users.length; i++)
            whitelist[users[i]] = 0;
    }

    function commitTransferOwnership(address newOwner) external onlyOwner {
        require(newOwner != pendingOwner && newOwner != owner, "address was submitted or is current owner");
        pendingOwner = newOwner;
        ownershipTransferDeadline = block.timestamp + OWNERSHIP_TRANSFER_DELAY;

        emit NewOwnerCommitted(
            msg.sender,
            newOwner,
            block.timestamp + OWNERSHIP_TRANSFER_DELAY
        );
    }

    function acceptTransferOwnership() external {
        require(msg.sender == pendingOwner, "Only new owner");
        require(
            block.timestamp >= ownershipTransferDeadline,
            "Deadline not passed"
        );

        emit NewOwnerAccepted(owner, msg.sender);

        owner = pendingOwner;
        pendingOwner = address(0);
        ownershipTransferDeadline = 0;
    }

    function revokeTransferOwnership() external onlyOwner {
        emit NewOwnerRevoked(msg.sender, pendingOwner);

        pendingOwner = address(0);
        ownershipTransferDeadline = 0;
    }
}
