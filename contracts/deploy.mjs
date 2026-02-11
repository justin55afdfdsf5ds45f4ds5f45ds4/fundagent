import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = 'https://monad-mainnet.drpc.org';
const PRIVATE_KEY = '0x83567924b6b44b28678b3f8d1a0bb2cad120c3426dc394cddbc957bfdc2ada53';
const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.abi'), 'utf8'));
const bin = fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.bin'), 'utf8');

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 143, name: 'monad' });
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Deploying from:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'MON');
  console.log('Treasury address:', TREASURY);
  console.log('Fee: 0.01% (1 basis point) on all pooled trades\n');

  const factory = new ethers.ContractFactory(abi, '0x' + bin, wallet);
  console.log('Deploying AgentNetwork contract with fee mechanism...');

  const contract = await factory.deploy(TREASURY);
  console.log('TX hash:', contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log('Contract deployed at:', addr);

  // Verify treasury is set correctly
  const treasurySet = await contract.treasury();
  console.log('Treasury verified:', treasurySet);

  // Register Fund Agent
  console.log('\nRegistering Fund Agent...');
  const tx1 = await contract.registerAgent('Fund Agent (EmpusaAI)');
  await tx1.wait();
  console.log('Fund Agent registered, TX:', tx1.hash);

  // Check fee constants
  const feeBps = await contract.FEE_BPS();
  const denominator = await contract.BPS_DENOMINATOR();
  console.log(`\nFee: ${feeBps}/${denominator} = ${(Number(feeBps) / Number(denominator) * 100).toFixed(2)}%`);

  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('Contract:', addr);
  console.log('Treasury:', TREASURY);
  console.log('Fee: 0.01% on all pooled trades');
}

main().catch(e => { console.error(e); process.exit(1); });
