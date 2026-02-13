const { ethers } = require('ethers');

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';
const MAX_TRADE_MON = 5;     // Max per trade
const BUDGET_MON = 25;       // Total budget for external trades

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).set(CORS).end();
  if (req.method !== 'POST') return res.status(405).set(CORS).json({ error: 'POST only' });

  try {
    const { agentName, token, action, amountMON, thesis } = req.body || {};

    if (!agentName || !token || !action) {
      return res.status(400).set(CORS).json({ error: 'agentName, token, and action (BUY/SELL) are required' });
    }

    const amount = Math.min(parseFloat(amountMON) || 0.1, MAX_TRADE_MON);

    // Check budget (read from Supabase activity log)
    const logRes = await fetch(
      `${SUPABASE_URL}/rest/v1/network_activity?type=eq.external_trade&select=data&order=created_at.desc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const logs = await logRes.json();
    let totalSpent = 0;
    if (Array.isArray(logs)) {
      logs.forEach(l => { if (l.data && l.data.amount) totalSpent += parseFloat(l.data.amount); });
    }

    if (totalSpent + amount > BUDGET_MON) {
      return res.status(429).set(CORS).json({
        error: `Budget exceeded. ${BUDGET_MON} MON total for external trades, ${(BUDGET_MON - totalSpent).toFixed(2)} MON remaining.`,
      });
    }

    // Execute real on-chain transaction
    const rpcUrl = process.env.MONAD_RPC_URL || 'https://monad-mainnet.drpc.org';
    const privateKey = process.env.AGENT_PRIVATE_KEY;
    if (!privateKey) return res.status(500).set(CORS).json({ error: 'No private key configured' });

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const memo = `${action}:${token}:${amount}MON:by:${agentName}`;
    const tx = await wallet.sendTransaction({
      to: TREASURY,
      value: ethers.parseEther(amount.toString()),
      data: ethers.toUtf8Bytes(memo),
    });
    const receipt = await tx.wait();

    // Log to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/network_activity`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'external_trade',
        agent_name: agentName,
        data: { token, action, amount: amount.toString(), thesis: thesis || '', txHash: receipt.hash, block: receipt.blockNumber },
      }),
    });

    // Also post to chat
    await fetch(`${SUPABASE_URL}/rest/v1/network_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_name: agentName,
        content: `${action} ${amount} MON of ${token}${thesis ? ' — ' + thesis : ''}`,
        message_type: 'trade_signal',
      }),
    });

    return res.status(200).set(CORS).json({
      success: true,
      trade: { agent: agentName, action, token, amount: amount + ' MON', thesis: thesis || '' },
      tx: { hash: receipt.hash, block: receipt.blockNumber, explorer: `https://monadvision.com/tx/${receipt.hash}` },
      budget: { spent: (totalSpent + amount).toFixed(2) + ' MON', remaining: (BUDGET_MON - totalSpent - amount).toFixed(2) + ' MON' },
    });

  } catch (e) {
    return res.status(500).set(CORS).json({ error: e.message });
  }
};
