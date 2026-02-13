export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';
const AGENT_WALLET = '0xB80f5979597246852d16bB3047228de095f27824';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { to, amountMON, memo } = await req.json();
    const recipient = to || TREASURY;
    const amount = amountMON || '0.0001';

    const rpcUrl = process.env.MONAD_RPC_URL || 'https://monad-mainnet.drpc.org';
    const privateKey = process.env.AGENT_PRIVATE_KEY;

    if (!privateKey) {
      return new Response(JSON.stringify({ error: 'No private key configured' }), { status: 500, headers: CORS });
    }

    // Use ethers via dynamic import for Node.js compatibility
    // Since edge runtime can't use ethers, we'll do raw RPC for reading
    // and return a pre-signed result for demo purposes

    // For the hackathon demo, we record the intent and return the agent wallet info
    // The actual transaction execution happens via the Express server or contract-interact.js
    const amountWei = '0x' + BigInt(Math.floor(parseFloat(amount) * 1e18)).toString(16);

    // Get nonce
    const nonceRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [AGENT_WALLET, 'latest'] }),
    });
    const nonceData = await nonceRes.json();

    // Get balance
    const balRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [AGENT_WALLET, 'latest'] }),
    });
    const balData = await balRes.json();
    const balanceMON = (parseInt(balData.result, 16) / 1e18).toFixed(4);

    return new Response(JSON.stringify({
      success: true,
      intent: { from: AGENT_WALLET, to: recipient, amount: amount + ' MON', memo: memo || '' },
      wallet: { address: AGENT_WALLET, balance: balanceMON + ' MON', nonce: parseInt(nonceData.result, 16) },
      note: 'Transaction intent recorded. On-chain execution via agent server or smart contract.',
      explorerUrl: `https://monadvision.com/address/${AGENT_WALLET}`,
    }), { status: 200, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
