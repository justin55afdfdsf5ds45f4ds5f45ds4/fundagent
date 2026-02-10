import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = 'https://monad-mainnet.drpc.org';
const PRIVATE_KEY = '0x83567924b6b44b28678b3f8d1a0bb2cad120c3426dc394cddbc957bfdc2ada53';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.abi'), 'utf8'));
const bin = fs.readFileSync(path.join(__dirname, 'out/contracts_AgentNetwork_sol_AgentNetwork.bin'), 'utf8');

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 143, name: 'monad' });
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Deploying from:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'MON');

  const factory = new ethers.ContractFactory(abi, '0x' + bin, wallet);
  console.log('Deploying AgentNetwork contract...');

  const contract = await factory.deploy();
  console.log('TX hash:', contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log('Contract deployed at:', addr);

  // Register Fund Agent
  console.log('Registering Fund Agent...');
  const tx1 = await contract.registerAgent('Fund Agent (EmpusaAI)');
  await tx1.wait();
  console.log('Fund Agent registered, TX:', tx1.hash);

  console.log('\nDone! Contract address:', addr);
}

main().catch(e => { console.error(e); process.exit(1); });
