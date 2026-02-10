export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const NETWORK_ROW_ID = 2;

async function getAgents() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${NETWORK_ROW_ID}&select=state`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  if (rows.length > 0 && rows[0].state) return rows[0].state;
  return { agents: [] };
}

async function saveAgents(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/agent_state`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: NETWORK_ROW_ID, state: data }),
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === 'GET') {
      const data = await getAgents();
      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { name, wallet, token, tokenSymbol, moltbook, description } = body;

      if (!name || !wallet) {
        return new Response(JSON.stringify({ error: 'name and wallet are required' }), { status: 400, headers: CORS });
      }

      const data = await getAgents();
      const existing = data.agents.find(a => a.wallet.toLowerCase() === wallet.toLowerCase());
      if (existing) {
        return new Response(JSON.stringify({ error: 'Agent already registered', agent: existing }), { status: 409, headers: CORS });
      }

      const agent = {
        id: crypto.randomUUID(),
        name,
        wallet,
        token: token || null,
        tokenSymbol: tokenSymbol || null,
        moltbook: moltbook || null,
        description: description || '',
        joinedAt: new Date().toISOString(),
        online: true,
        trustScore: 50,
      };

      data.agents.push(agent);
      await saveAgents(data);

      return new Response(JSON.stringify({ success: true, agent }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
