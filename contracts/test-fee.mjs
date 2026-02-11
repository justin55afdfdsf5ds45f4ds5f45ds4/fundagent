import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = 'https://monad-mainnet.drpc.org';
const ALPHA_SCOUT_KEY = '0xbf38c8f616f182ae57597c327b7b48e706257e97f68923287ae5b45a1d985635';
const FUND_AGENT_KEY = '0x83567924b6b44b28678b3f8d1a0bb2cad120c3426dc394cddbc957bfdc2ada53';
const CONTRACT = '0x23d1878870B1C29B54fDFc6163AEBf315780E619';
const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.abi'), 'utf8'));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 143, name: 'monad' });

  // Register Alpha Scout
  const alphaWallet = new ethers.Wallet(ALPHA_SCOUT_KEY, provider);
  console.log('Alpha Scout wallet:', alphaWallet.address);

  const contractAlpha = new ethers.Contract(CONTRACT, abi, alphaWallet);
  console.log('Registering Alpha Scout...');
  const tx1 = await contractAlpha.registerAgent('Alpha Scout');
  await tx1.wait();
  console.log('Alpha Scout registered, TX:', tx1.hash);

  // Check agent count
  const agentCount = await contractAlpha.getAgentCount();
  console.log('Total agents registered:', agentCount.toString());

  // Check treasury balance before fee
  const treasuryBalanceBefore = await provider.getBalance(TREASURY);
  console.log('\n=== Treasury Balance Before ===');
  console.log(ethers.formatEther(treasuryBalanceBefore), 'MON');

  // Test fee collection: Alpha Scout sends 10 MON as if doing a pooled trade
  // 0.01% of 10 MON = 0.001 MON goes to treasury
  console.log('\n=== Testing Fee Collection ===');
  console.log('Alpha Scout collecting fee: sending 0.01 MON (simulating 10 MON trade, 0.01% fee)...');

  const feeAmount = ethers.parseEther('0.01'); // Representing 0.01% of 10 MON
  const tx2 = await contractAlpha.collectFee({ value: feeAmount });
  await tx2.wait();
  console.log('Fee collected, TX:', tx2.hash);

  // Check treasury balance after
  const treasuryBalanceAfter = await provider.getBalance(TREASURY);
  console.log('\n=== Treasury Balance After ===');
  console.log(ethers.formatEther(treasuryBalanceAfter), 'MON');
  console.log('Fee collected:', ethers.formatEther(treasuryBalanceAfter - treasuryBalanceBefore), 'MON');

  // Check total fees from contract
  const totalFees = await contractAlpha.totalFeesCollected();
  console.log('Total fees tracked on-chain:', ethers.formatEther(totalFees), 'MON');

  // Re-verify the 3 existing trades on the new contract
  console.log('\n=== Re-verifying existing trades on new contract ===');

  // Alpha Scout verifies Fund Agent's COIN trade
  const tx3 = await contractAlpha.verifyTrade(
    '0x0f8508c043220e3efde3c831c26bcb0741f350594b53abebea54515d1d391cde',
    '0xB80f5979597246852d16bB3047228de095f27824',
    '$COIN',
    ethers.parseEther('5')
  );
  await tx3.wait();
  console.log('Fund Agent $COIN trade verified by Alpha Scout, TX:', tx3.hash);

  // Fund Agent verifies Alpha Scout's trades
  const fundWallet = new ethers.Wallet(FUND_AGENT_KEY, provider);
  const contractFund = new ethers.Contract(CONTRACT, abi, fundWallet);

  const tx4 = await contractFund.verifyTrade(
    '0x92b929926037b6a639496eabf1c3b5e3bc2a6c33b30b1bbed6a6d755e16c4ce2',
    alphaWallet.address,
    '$COIN',
    ethers.parseEther('10')
  );
  await tx4.wait();
  console.log('Alpha Scout $COIN trade verified by Fund Agent, TX:', tx4.hash);

  const tx5 = await contractFund.verifyTrade(
    '0x787f04c87ac1ad116266c9329853dd426043d59fbff7bb4e799bb35bff54df56',
    alphaWallet.address,
    '$CHOG',
    ethers.parseEther('5')
  );
  await tx5.wait();
  console.log('Alpha Scout $CHOG trade verified by Fund Agent, TX:', tx5.hash);

  const verifyCount = await contractAlpha.getVerificationCount();
  console.log('\nTotal verifications:', verifyCount.toString());

  console.log('\n=== SUMMARY ===');
  console.log('Contract:', CONTRACT);
  console.log('Treasury:', TREASURY);
  console.log('Agents registered:', agentCount.toString());
  console.log('Trades verified:', verifyCount.toString());
  console.log('Total fees collected:', ethers.formatEther(totalFees), 'MON');
  console.log('Fee auto-collected to treasury ✓');
}

main().catch(e => { console.error(e); process.exit(1); });
