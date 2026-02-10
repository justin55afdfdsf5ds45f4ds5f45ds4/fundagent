export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const PROPOSALS_ROW_ID = 4;

async function getProposals() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${PROPOSALS_ROW_ID}&select=state`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  if (rows.length > 0 && rows[0].state) return rows[0].state;
  return { proposals: [] };
}

async function saveProposals(data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${PROPOSALS_ROW_ID}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ state: data }),
    }
  );
  if (res.status === 404 || res.status === 406) {
    await fetch(`${SUPABASE_URL}/rest/v1/agent_state`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ id: PROPOSALS_ROW_ID, state: data }),
    });
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === 'GET') {
      const data = await getProposals();
      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { token, tokenSymbol, proposer, amountMON, thesis, action } = body;

      if (!token || !proposer || !amountMON) {
        return new Response(JSON.stringify({ error: 'token, proposer, and amountMON are required' }), { status: 400, headers: CORS });
      }

      const data = await getProposals();
      const proposal = {
        id: crypto.randomUUID(),
        token,
        tokenSymbol: tokenSymbol || token.slice(0, 8),
        proposer,
        action: action || 'BUY',
        amountMON,
        thesis: thesis || '',
        status: 'pending',
        votes: [],
        createdAt: new Date().toISOString(),
      };

      data.proposals.push(proposal);
      await saveProposals(data);

      return new Response(JSON.stringify({ success: true, proposal }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
