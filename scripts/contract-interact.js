const { ethers } = require('ethers');
require('dotenv').config();

const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

const CONTRACT = '0x23d1878870B1C29B54fDFc6163AEBf315780E619';
const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';

// ABI from AgentNetwork.sol
const ABI = [
  'function owner() view returns (address)',
  'function treasury() view returns (address)',
  'function totalFeesCollected() view returns (uint256)',
  'function getAgentCount() view returns (uint256)',
  'function getPooledTradeCount() view returns (uint256)',
  'function getVerificationCount() view returns (uint256)',
  'function agents(address) view returns (string name, address wallet, uint256 joinedAt, bool active)',
  'function getPooledTrade(uint256 idx) view returns (address initiator, address tokenAddress, string tokenSymbol, uint256 totalAmount, uint256 feeCollected, uint256 executedAt)',
  'function getVerification(uint256 idx) view returns (bytes32 txHash, address proposer, address verifier, string tokenSymbol, uint256 amountWei, uint256 verifiedAt)',
  'function registerAgent(string name)',
  'function executePooledTrade(address recipient, address tokenAddress, string tokenSymbol, uint8 participantCount) payable',
  'function collectFee() payable',
  'function verifyTrade(bytes32 txHash, address proposer, string tokenSymbol, uint256 amountWei)',
  'event AgentJoined(address indexed wallet, string name)',
  'event TradeVerified(bytes32 indexed txHash, address indexed proposer, address indexed verifier, string tokenSymbol)',
  'event PooledTradeExecuted(address indexed initiator, address indexed tokenAddress, uint256 totalAmount, uint256 fee)',
  'event FeeCollected(address indexed from, uint256 amount, address indexed treasury)',
];

const contract = new ethers.Contract(CONTRACT, ABI, wallet);

// Token addresses (using zero address as placeholder for native MON trades)
const TOKENS = {
  '$FUND': '0xD7d331F7AB0842e877DD8c676eFae237ecB17777',
  '$CHOG': '0x0000000000000000000000000000000000000001',
  '$LOBSTER': '0x0000000000000000000000000000000000000002',
  '$MOLT': '0x0000000000000000000000000000000000000003',
  '$MONSHI': '0x0000000000000000000000000000000000000004',
  '$ARENA': '0x0000000000000000000000000000000000000005',
  '$PACT': '0x0000000000000000000000000000000000000006',
  '$COIN': '0x0000000000000000000000000000000000000007',
  '$PiMon': '0x0000000000000000000000000000000000000008',
  '$PKMON': '0x0000000000000000000000000000000000000009',
};

async function checkContract() {
  console.log('=== CONTRACT STATUS ===');
  const code = await provider.getCode(CONTRACT);
  if (code === '0x') {
    console.log('!! CONTRACT NOT DEPLOYED at', CONTRACT);
    return false;
  }
  console.log('Contract has code:', code.length, 'bytes');

  try {
    const owner = await contract.owner();
    console.log('Owner:', owner);
    const treasury = await contract.treasury();
    console.log('Treasury:', treasury);
    const agentCount = await contract.getAgentCount();
    console.log('Agent count:', agentCount.toString());
    const tradeCount = await contract.getPooledTradeCount();
    console.log('Pooled trade count:', tradeCount.toString());
    const verifyCount = await contract.getVerificationCount();
    console.log('Verification count:', verifyCount.toString());
    const fees = await contract.totalFeesCollected();
    console.log('Total fees collected:', ethers.formatEther(fees), 'MON');
  } catch (e) {
    console.log('Error reading contract:', e.message);
    return false;
  }
  return true;
}

async function registerAgents() {
  console.log('\n=== REGISTERING AGENTS ===');

  // Check if already registered
  try {
    const agentInfo = await contract.agents(wallet.address);
    if (agentInfo.active) {
      console.log('Already registered as:', agentInfo.name);
      return;
    }
  } catch (e) {}

  try {
    const tx = await contract.registerAgent('Fund Agent');
    const receipt = await tx.wait();
    console.log('Registered Fund Agent:', receipt.hash);
  } catch (e) {
    console.log('Register error:', e.message.substring(0, 100));
  }
}

async function executePooledTrades() {
  console.log('\n=== EXECUTING POOLED TRADES ===');

  const trades = [
    { token: '$FUND', addr: TOKENS['$FUND'], amount: '0.5', participants: 3 },
    { token: '$CHOG', addr: TOKENS['$CHOG'], amount: '0.3', participants: 2 },
    { token: '$LOBSTER', addr: TOKENS['$LOBSTER'], amount: '0.4', participants: 3 },
    { token: '$MOLT', addr: TOKENS['$MOLT'], amount: '0.25', participants: 2 },
    { token: '$ARENA', addr: TOKENS['$ARENA'], amount: '0.35', participants: 3 },
    { token: '$PACT', addr: TOKENS['$PACT'], amount: '0.2', participants: 2 },
    { token: '$COIN', addr: TOKENS['$COIN'], amount: '0.15', participants: 2 },
    { token: '$PiMon', addr: TOKENS['$PiMon'], amount: '0.3', participants: 3 },
  ];

  const results = [];

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    try {
      console.log(`Trade ${i + 1}/${trades.length}: ${t.token} ${t.amount} MON (${t.participants} agents)...`);
      const tx = await contract.executePooledTrade(
        TREASURY,           // recipient (treasury receives the trade)
        t.addr,             // token address
        t.token,            // token symbol
        t.participants,     // participant count
        { value: ethers.parseEther(t.amount) }
      );
      const receipt = await tx.wait();
      console.log(`  TX: ${receipt.hash} | Block: ${receipt.blockNumber}`);
      results.push({
        hash: receipt.hash,
        block: receipt.blockNumber,
        token: t.token,
        amount: t.amount,
        participants: t.participants,
      });
    } catch (e) {
      console.log(`  FAILED: ${e.message.substring(0, 120)}`);
    }
  }

  return results;
}

async function collectFees() {
  console.log('\n=== COLLECTING FEES ===');
  try {
    const tx = await contract.collectFee({ value: ethers.parseEther('0.01') });
    const receipt = await tx.wait();
    console.log('Fee collected:', receipt.hash);
  } catch (e) {
    console.log('Fee error:', e.message.substring(0, 100));
  }
}

async function readFinalState() {
  console.log('\n=== FINAL CONTRACT STATE ===');
  try {
    const agentCount = await contract.getAgentCount();
    console.log('Agents:', agentCount.toString());
    const tradeCount = await contract.getPooledTradeCount();
    console.log('Pooled trades:', tradeCount.toString());
    const verifyCount = await contract.getVerificationCount();
    console.log('Verifications:', verifyCount.toString());
    const fees = await contract.totalFeesCollected();
    console.log('Total fees:', ethers.formatEther(fees), 'MON');

    // Read all pooled trades
    for (let i = 0; i < Number(tradeCount); i++) {
      const t = await contract.getPooledTrade(i);
      console.log(`  Trade ${i}: ${t.tokenSymbol} | ${ethers.formatEther(t.totalAmount)} MON | fee: ${ethers.formatEther(t.feeCollected)} MON | block: ${new Date(Number(t.executedAt) * 1000).toISOString()}`);
    }
  } catch (e) {
    console.log('Read error:', e.message.substring(0, 100));
  }
}

async function main() {
  console.log('Wallet:', wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(bal), 'MON\n');

  const hasContract = await checkContract();
  if (!hasContract) {
    console.log('\nContract not found. Cannot proceed.');
    return;
  }

  await registerAgents();
  const tradeResults = await executePooledTrades();
  await collectFees();
  await readFinalState();

  // Save results
  const fs = require('fs');
  fs.writeFileSync('scripts/contract-results.json', JSON.stringify(tradeResults, null, 2));
  console.log('\nResults saved to scripts/contract-results.json');

  const finalBal = await provider.getBalance(wallet.address);
  console.log('Final balance:', ethers.formatEther(finalBal), 'MON');
  console.log('Spent:', (parseFloat(ethers.formatEther(bal)) - parseFloat(ethers.formatEther(finalBal))).toFixed(4), 'MON');
}

main().catch(e => console.error('FATAL:', e.message));
