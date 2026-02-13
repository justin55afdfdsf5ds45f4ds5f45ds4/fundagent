export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';
const FUND_WALLET = '0xB80f5979597246852d16bB3047228de095f27824';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const SB_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function getFundAgentState() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_state?id=eq.1&select=state`, { headers: SB_HEADERS });
  const rows = await res.json();
  if (rows.length > 0 && rows[0].state) {
    rows[0].state.agentProfile = {
      name: 'Fund Agent', wallet: FUND_WALLET,
      token: '0xD7d331F7AB0842e877DD8c676eFae237ecB17777', tokenSymbol: 'FUND',
      description: 'Conservative AI VC with committee-driven approach',
      trustScore: 100, online: true,
    };
    return rows[0].state;
  }
  return null;
}

async function getAgentDashboard(wallet) {
  const [agentRes, msgRes, actRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/network_agents?wallet=ilike.${wallet}&select=*`, { headers: SB_HEADERS }),
    fetch(`${SUPABASE_URL}/rest/v1/network_messages?select=*&order=created_at.desc&limit=100`, { headers: SB_HEADERS }),
    fetch(`${SUPABASE_URL}/rest/v1/network_activity?select=*&order=created_at.desc&limit=100`, { headers: SB_HEADERS }),
  ]);

  const agents = await agentRes.json();
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const agent = agents[0];

  const allMessages = await msgRes.json();
  const allActivities = await actRes.json();

  const myMessages = Array.isArray(allMessages) ? allMessages.filter(m => m.from_name === agent.name) : [];
  const myActivities = Array.isArray(allActivities) ? allActivities.filter(a => a.agent_name === agent.name) : [];

  const trades = myActivities
    .filter(a => a.type === 'external_trade')
    .map(a => ({
      type: a.data?.action || 'BUY',
      token: a.data?.token || '',
      symbol: a.data?.token ? a.data.token.substring(2, 8).toUpperCase() : '',
      name: 'Token',
      amount: a.data?.amount || '0',
      thesis: a.data?.thesis || '',
      time: a.created_at,
      method: 'bonding_curve',
    }));

  const posts = myMessages.map(m => ({
    title: `${agent.name} — ${m.message_type || 'message'}`,
    content: m.content || '',
    time: m.created_at,
    url: '',
  }));

  let balance = '0';
  try {
    const rpcUrl = process.env.MONAD_RPC_URL || 'https://monad-mainnet.drpc.org';
    const balRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [wallet, 'latest'] }),
    });
    const balData = await balRes.json();
    if (balData.result) balance = (parseInt(balData.result, 16) / 1e18).toFixed(4);
  } catch (_) {}

  return {
    mode: 'NEUTRAL',
    balance,
    tradeCount: trades.length,
    postCount: posts.length,
    trades,
    posts: posts.slice(0, 50),
    strategy: { name: agent.name + ' Strategy', description: agent.description || 'Autonomous trading agent on Monad' },
    committeeEnabled: false,
    committeeHistory: [],
    lastUpdated: new Date().toISOString(),
    agentProfile: {
      name: agent.name,
      wallet: agent.wallet,
      token: agent.token_address,
      tokenSymbol: agent.token_symbol,
      description: agent.description,
      trustScore: agent.trust_score,
      online: agent.online,
      joinedAt: agent.joined_at,
    },
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const url = new URL(req.url);
    const wallet = url.searchParams.get('wallet');

    if (!wallet || wallet.toLowerCase() === FUND_WALLET.toLowerCase()) {
      const state = await getFundAgentState();
      if (state) {
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: { ...CORS, 'Cache-Control': 'public, s-maxage=30' },
        });
      }
      return new Response(JSON.stringify({ status: 'offline', error: 'No state found' }), { status: 200, headers: CORS });
    }

    const dashboard = await getAgentDashboard(wallet);
    if (!dashboard) {
      return new Response(JSON.stringify({
        status: 'not_found',
        error: 'Agent not found. Join the network first via POST /api/network/join',
      }), { status: 404, headers: CORS });
    }

    return new Response(JSON.stringify(dashboard), {
      status: 200,
      headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'offline', error: 'Cloud sync unavailable' }), {
      status: 200,
      headers: CORS,
    });
  }
}
