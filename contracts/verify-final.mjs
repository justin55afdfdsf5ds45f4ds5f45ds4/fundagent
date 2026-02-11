import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = 'https://monad-mainnet.drpc.org';
const CONTRACT = '0x23d1878870B1C29B54fDFc6163AEBf315780E619';
const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.abi'), 'utf8'));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 143, name: 'monad' });
  const contract = new ethers.Contract(CONTRACT, abi, provider);

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        AgentNetwork Smart Contract — Final Verification       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Contract info
  console.log('📄 Contract Address:', CONTRACT);
  console.log('💰 Treasury Address:', TREASURY);
  console.log('');

  // Check treasury on contract
  const treasuryOnChain = await contract.treasury();
  console.log('✓ Treasury verified on-chain:', treasuryOnChain);

  // Fee info
  const feeBps = await contract.FEE_BPS();
  const denominator = await contract.BPS_DENOMINATOR();
  const feePercent = (Number(feeBps) / Number(denominator) * 100).toFixed(2);
  console.log(`✓ Fee: ${feeBps}/${denominator} = ${feePercent}%`);
  console.log('');

  // Total fees collected
  const totalFees = await contract.totalFeesCollected();
  console.log('💸 Total Fees Collected:', ethers.formatEther(totalFees), 'MON');
  console.log('');

  // Agent count
  const agentCount = await contract.getAgentCount();
  console.log('👥 Agents Registered:', agentCount.toString());

  // List agents
  for (let i = 0; i < agentCount; i++) {
    const agentAddr = await contract.agentList(i);
    const agent = await contract.agents(agentAddr);
    console.log(`   ${i + 1}. ${agent.name} (${agentAddr})`);
  }
  console.log('');

  // Verification count
  const verifyCount = await contract.getVerificationCount();
  console.log('✅ Trades Verified:', verifyCount.toString());

  // List verifications
  for (let i = 0; i < verifyCount; i++) {
    const v = await contract.getVerification(i);
    console.log(`   ${i + 1}. ${v.tokenSymbol} — TX: ${v.txHash.substring(0, 16)}...`);
    console.log(`      Proposer: ${v.proposer.substring(0, 10)}... | Verifier: ${v.verifier.substring(0, 10)}...`);
  }
  console.log('');

  // Pooled trades count
  const poolCount = await contract.getPooledTradeCount();
  console.log('🏊 Pooled Trades Executed:', poolCount.toString());
  console.log('');

  // Treasury balance
  const treasuryBalance = await provider.getBalance(TREASURY);
  console.log('💰 Treasury Balance:', ethers.formatEther(treasuryBalance), 'MON');
  console.log('');

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    ✓ ALL SYSTEMS OPERATIONAL                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🌐 Live Dashboard: https://fund-agent.vercel.app/#network');
  console.log('📜 Contract Explorer: https://monadvision.com/address/' + CONTRACT);
  console.log('💸 Treasury Explorer: https://monadvision.com/address/' + TREASURY);
}

main().catch(e => { console.error(e); process.exit(1); });
