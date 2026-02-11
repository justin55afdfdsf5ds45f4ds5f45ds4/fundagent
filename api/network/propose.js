export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === 'GET') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/network_proposals?select=*&order=created_at.desc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const proposals = await res.json();
      return new Response(JSON.stringify({ proposals }), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { token, tokenSymbol, proposer, amountMON, thesis, action } = body;

      if (!token || !proposer || !amountMON) {
        return new Response(JSON.stringify({ error: 'token, proposer, and amountMON are required' }), { status: 400, headers: CORS });
      }

      const agentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/network_agents?name=ilike.${encodeURIComponent(proposer)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const agents = await agentRes.json();
      const proposerId = agents.length > 0 ? agents[0].id : null;

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/network_proposals`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          proposer_id: proposerId,
          proposer_name: proposer,
          token_address: token,
          token_symbol: tokenSymbol || token.slice(0, 8),
          action: action || 'BUY',
          amount_mon: amountMON,
          thesis: thesis || '',
          status: 'pending',
        }),
      });

      if (!insertRes.ok) {
        const error = await insertRes.text();
        return new Response(JSON.stringify({ error: 'Failed to create proposal', details: error }), { status: 500, headers: CORS });
      }

      const proposal = await insertRes.json();
      return new Response(JSON.stringify({ success: true, proposal: proposal[0] }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
