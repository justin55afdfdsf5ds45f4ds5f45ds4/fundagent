import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = 'https://monad-mainnet.drpc.org';
const ALPHA_SCOUT_KEY = '0xbf38c8f616f182ae57597c327b7b48e706257e97f68923287ae5b45a1d985635';
const FUND_AGENT_KEY = '0x83567924b6b44b28678b3f8d1a0bb2cad120c3426dc394cddbc957bfdc2ada53';
const CONTRACT = '0x533079ff74D70811600c4CD96441B36b9d099BCd';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.abi'), 'utf8'));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 143, name: 'monad' });

  // Register Alpha Scout
  const alphaWallet = new ethers.Wallet(ALPHA_SCOUT_KEY, provider);
  console.log('Alpha Scout wallet:', alphaWallet.address);
  const alphaBalance = await provider.getBalance(alphaWallet.address);
  console.log('Alpha Scout balance:', ethers.formatEther(alphaBalance), 'MON');

  const contractAlpha = new ethers.Contract(CONTRACT, abi, alphaWallet);
  console.log('\nRegistering Alpha Scout on contract...');
  const tx1 = await contractAlpha.registerAgent('Alpha Scout');
  await tx1.wait();
  console.log('Alpha Scout registered, TX:', tx1.hash);

  // Alpha Scout verifies Fund Agent's $COIN trade
  const fundAgentCoinTx = '0x0f8508c043220e3efde3c831c26bcb0741f350594b53abebea54515d1d391cde';
  const fundAgentWallet = '0xB80f5979597246852d16bB3047228de095f27824';
  console.log('\nAlpha Scout verifying Fund Agent\'s $COIN trade...');
  const tx2 = await contractAlpha.verifyTrade(
    fundAgentCoinTx,
    fundAgentWallet,
    '$COIN',
    ethers.parseEther('5')
  );
  await tx2.wait();
  console.log('Trade verified on-chain, TX:', tx2.hash);

  // Fund Agent verifies Alpha Scout's $COIN trade
  const fundWallet = new ethers.Wallet(FUND_AGENT_KEY, provider);
  const contractFund = new ethers.Contract(CONTRACT, abi, fundWallet);
  const alphaScoutCoinTx = '0x92b929926037b6a639496eabf1c3b5e3bc2a6c33b30b1bbed6a6d755e16c4ce2';
  console.log('\nFund Agent verifying Alpha Scout\'s $COIN trade...');
  const tx3 = await contractFund.verifyTrade(
    alphaScoutCoinTx,
    alphaWallet.address,
    '$COIN',
    ethers.parseEther('10')
  );
  await tx3.wait();
  console.log('Trade verified on-chain, TX:', tx3.hash);

  // Check counts
  const agentCount = await contractAlpha.getAgentCount();
  const verifyCount = await contractAlpha.getVerificationCount();
  console.log('\n--- Contract State ---');
  console.log('Agents registered:', agentCount.toString());
  console.log('Trades verified:', verifyCount.toString());
  console.log('Contract:', CONTRACT);
}

main().catch(e => { console.error(e); process.exit(1); });
