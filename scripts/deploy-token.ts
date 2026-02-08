import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// NOTE: Replace with actual nad.fun contract ABI from documentation
const NADFUN_ABI = [
  // Placeholder - get from nad.fun docs
  'function createToken(string symbol, string name, string description, string imageUrl) external returns (address)',
];

async function deployToken() {
  console.log('🚀 Deploying $FUND token on nad.fun...');

  const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);

  console.log(`Deploying from: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} MON`);

  const nadfunContract = new ethers.Contract(
    process.env.NADFUN_CONTRACT!,
    NADFUN_ABI,
    wallet
  );

  try {
    const tx = await nadfunContract.createToken(
      'FUND',
      'Fund Agent',
      'Autonomous AI VC Fund on Monad. Managed by an AI agent that rates, roasts, and invests in other agents.',
      '' // Optional: Add image URL
    );

    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`✅ Token deployed!`);
    console.log(`Transaction: ${receipt.hash}`);
    
    // The token address should be in the receipt events
    // TODO: Parse the actual token address from receipt
    console.log('\n⚠️  Add the token address to your .env file:');
    console.log('FUND_TOKEN_ADDRESS=0x...');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

deployToken();
