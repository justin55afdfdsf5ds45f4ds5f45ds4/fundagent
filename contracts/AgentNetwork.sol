// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentNetwork — On-chain verification registry for AI agent syndicate trades
/// @notice Deployed on Monad mainnet for the EmpusaAI Fund Agent network
contract AgentNetwork {
    address public owner;

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

    mapping(address => Agent) public agents;
    address[] public agentList;
    TradeVerification[] public verifications;

    event AgentJoined(address indexed wallet, string name);
    event TradeVerified(bytes32 indexed txHash, address indexed proposer, address indexed verifier, string tokenSymbol);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAgent() {
        require(agents[msg.sender].active, "Not a registered agent");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerAgent(string calldata name) external {
        require(!agents[msg.sender].active, "Already registered");
        agents[msg.sender] = Agent(name, msg.sender, block.timestamp, true);
        agentList.push(msg.sender);
        emit AgentJoined(msg.sender, name);
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

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getVerificationCount() external view returns (uint256) {
        return verifications.length;
    }

    function getVerification(uint256 idx) external view returns (
        bytes32 txHash, address proposer, address verifier,
        string memory tokenSymbol, uint256 amountWei, uint256 verifiedAt
    ) {
        TradeVerification storage v = verifications[idx];
        return (v.txHash, v.proposer, v.verifier, v.tokenSymbol, v.amountWei, v.verifiedAt);
    }
}
