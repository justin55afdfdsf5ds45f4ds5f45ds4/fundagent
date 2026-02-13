export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const TREASURY = '0xE8304Ba72614500a714C02aF3F2EDcCCD5983fC2';
const AGENT_WALLET = '0xB80f5979597246852d16bB3047228de095f27824';
const MAX_TRADE_MON = 5;
const BUDGET_MON = 25;

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { agentName, token, action, amountMON, thesis } = await req.json();

    if (!agentName || !token || !action) {
      return new Response(JSON.stringify({ error: 'agentName, token, and action (BUY/SELL) are required' }), { status: 400, headers: CORS });
    }

    const amount = Math.min(parseFloat(amountMON) || 0.1, MAX_TRADE_MON);

    // Check budget from Supabase activity log
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
      return new Response(JSON.stringify({
        error: `Budget exceeded. ${BUDGET_MON} MON total, ${(BUDGET_MON - totalSpent).toFixed(2)} MON remaining.`,
      }), { status: 429, headers: CORS });
    }

    const rpcUrl = process.env.MONAD_RPC_URL || 'https://monad-mainnet.drpc.org';

    // Get wallet balance via RPC
    const balRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [AGENT_WALLET, 'latest'] }),
    });
    const balData = await balRes.json();
    const balanceMON = (parseInt(balData.result, 16) / 1e18).toFixed(4);

    // Log trade intent to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/network_activity`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'external_trade',
        agent_name: agentName,
        data: { token, action, amount: amount.toString(), thesis: thesis || '', wallet: AGENT_WALLET },
      }),
    });

    // Post to network chat
    await fetch(`${SUPABASE_URL}/rest/v1/network_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_name: agentName,
        content: `${action} ${amount} MON of ${token}${thesis ? ' — ' + thesis : ''}`,
        message_type: 'trade_signal',
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      trade: { agent: agentName, action, token, amount: amount + ' MON', thesis: thesis || '' },
      wallet: { address: AGENT_WALLET, balance: balanceMON + ' MON' },
      budget: { spent: (totalSpent + amount).toFixed(2) + ' MON', remaining: (BUDGET_MON - totalSpent - amount).toFixed(2) + ' MON' },
      note: 'Trade signal recorded. On-chain execution via agent server or smart contract.',
    }), { status: 200, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
