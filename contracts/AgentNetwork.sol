// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentNetwork — On-chain registry + fee collection for AI agent syndicate trades
/// @notice Deployed on Monad mainnet for the EmpusaAI Fund Agent network
/// @dev 0.01% (1 basis point) fee on every pooled trade, sent to treasury
contract AgentNetwork {
    address public owner;
    address payable public treasury;
    uint256 public constant FEE_BPS = 1; // 0.01% = 1 basis point
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public totalFeesCollected;

    struct Agent {
        string name;
        address wallet;
        uint256 joinedAt;
        bool active;
    }

    struct TradeVerification {
        bytes32 txHash;
        address proposer;
        address verifier;
        string tokenSymbol;
        uint256 amountWei;
        uint256 verifiedAt;
        bool verified;
    }

    struct PooledTrade {
        address initiator;
        address tokenAddress;
        string tokenSymbol;
        uint256 totalAmount;
        uint256 feeCollected;
        uint256 executedAt;
        uint8 participantCount;
    }

    mapping(address => Agent) public agents;
    address[] public agentList;
    TradeVerification[] public verifications;
    PooledTrade[] public pooledTrades;

    event AgentJoined(address indexed wallet, string name);
    event TradeVerified(bytes32 indexed txHash, address indexed proposer, address indexed verifier, string tokenSymbol);
    event PooledTradeExecuted(address indexed initiator, address indexed tokenAddress, uint256 totalAmount, uint256 fee);
    event FeeCollected(address indexed from, uint256 amount, address indexed treasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAgent() {
        require(agents[msg.sender].active, "Not a registered agent");
        _;
    }

    constructor(address payable _treasury) {
        owner = msg.sender;
        treasury = _treasury;
    }

    function registerAgent(string calldata name) external {
        require(!agents[msg.sender].active, "Already registered");
        agents[msg.sender] = Agent(name, msg.sender, block.timestamp, true);
        agentList.push(msg.sender);
        emit AgentJoined(msg.sender, name);
    }

    /// @notice Execute a pooled trade with automatic 0.01% fee to treasury
    /// @dev Agents send MON to this function. Fee is skimmed and sent to treasury.
    ///      Remaining funds are forwarded to the specified recipient (e.g. bonding curve router).
    function executePooledTrade(
        address payable recipient,
        address tokenAddress,
        string calldata tokenSymbol,
        uint8 participantCount
    ) external payable onlyAgent {
        require(msg.value > 0, "Must send MON");
        require(recipient != address(0), "Invalid recipient");

        // Calculate 0.01% fee
        uint256 fee = (msg.value * FEE_BPS) / BPS_DENOMINATOR;
        uint256 tradeAmount = msg.value - fee;

        // Send fee to treasury
        if (fee > 0) {
            (bool feeSuccess, ) = treasury.call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
            totalFeesCollected += fee;
            emit FeeCollected(msg.sender, fee, treasury);
        }

        // Forward remaining to trade recipient (bonding curve router, DEX, etc.)
        (bool tradeSuccess, ) = recipient.call{value: tradeAmount}("");
        require(tradeSuccess, "Trade transfer failed");

        // Record the pooled trade
        pooledTrades.push(PooledTrade(
            msg.sender, tokenAddress, tokenSymbol,
            msg.value, fee, block.timestamp, participantCount
        ));

        emit PooledTradeExecuted(msg.sender, tokenAddress, msg.value, fee);
    }

    /// @notice Simple fee collection without trade routing (for recording off-chain trades)
    function collectFee() external payable {
        require(msg.value > 0, "Must send fee");
        (bool success, ) = treasury.call{value: msg.value}("");
        require(success, "Fee transfer failed");
        totalFeesCollected += msg.value;
        emit FeeCollected(msg.sender, msg.value, treasury);
    }

    function verifyTrade(
        bytes32 txHash,
        address proposer,
        string calldata tokenSymbol,
        uint256 amountWei
    ) external onlyAgent {
        require(proposer != msg.sender, "Cannot self-verify");
        verifications.push(TradeVerification(
            txHash, proposer, msg.sender, tokenSymbol, amountWei, block.timestamp, true
        ));
        emit TradeVerified(txHash, proposer, msg.sender, tokenSymbol);
    }

    function updateTreasury(address payable _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getVerificationCount() external view returns (uint256) {
        return verifications.length;
    }

    function getPooledTradeCount() external view returns (uint256) {
        return pooledTrades.length;
    }

    function getVerification(uint256 idx) external view returns (
        bytes32 txHash, address proposer, address verifier,
        string memory tokenSymbol, uint256 amountWei, uint256 verifiedAt
    ) {
        TradeVerification storage v = verifications[idx];
        return (v.txHash, v.proposer, v.verifier, v.tokenSymbol, v.amountWei, v.verifiedAt);
    }

    function getPooledTrade(uint256 idx) external view returns (
        address initiator, address tokenAddress, string memory tokenSymbol,
        uint256 totalAmount, uint256 feeCollected, uint256 executedAt
    ) {
        PooledTrade storage p = pooledTrades[idx];
        return (p.initiator, p.tokenAddress, p.tokenSymbol, p.totalAmount, p.feeCollected, p.executedAt);
    }
}
