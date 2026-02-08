import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function checkWallet() {
  console.log('💰 Checking agent wallet...');

  const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
  const address = process.env.AGENT_ADDRESS;

  if (!address) {
    console.error('❌ AGENT_ADDRESS not set in .env');
    process.exit(1);
  }

  const balance = await provider.getBalance(address);
  const balanceInMon = ethers.formatEther(balance);

  console.log(`\nWallet: ${address}`);
  console.log(`Balance: ${balanceInMon} MON`);

  if (parseFloat(balanceInMon) < 0.1) {
    console.log('\n⚠️  WARNING: Low balance!');
    console.log('The agent needs MON to:');
    console.log('  - Deploy the $FUND token');
    console.log('  - Buy other tokens');
    console.log('  - Pay gas fees');
    console.log('\nPlease send MON to the agent wallet.');
  } else {
    console.log('\n✅ Wallet is funded and ready!');
  }
}

checkWallet();
