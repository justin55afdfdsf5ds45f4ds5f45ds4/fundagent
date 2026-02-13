const { ethers } = require('ethers');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Treasury address (receives 0.01% fees)
const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(CORS).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).set(CORS).json({ error: 'POST only' });
  }

  try {
    const { to, amountMON, memo } = req.body || {};
    const recipient = to || TREASURY;
    const amount = amountMON || '0.0001'; // Default tiny amount

    const rpcUrl = process.env.MONAD_RPC_URL || 'https://monad-mainnet.drpc.org';
    const privateKey = process.env.AGENT_PRIVATE_KEY;

    if (!privateKey) {
      return res.status(500).set(CORS).json({ error: 'No private key configured' });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
      data: memo ? ethers.toUtf8Bytes(memo) : undefined,
    });

    const receipt = await tx.wait();

    return res.status(200).set(CORS).json({
      success: true,
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      from: wallet.address,
      to: recipient,
      amount: amount + ' MON',
      explorerUrl: `https://monadvision.com/tx/${receipt.hash}`,
    });
  } catch (e) {
    return res.status(500).set(CORS).json({ error: e.message });
  }
};
