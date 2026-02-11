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
        `${SUPABASE_URL}/rest/v1/network_agents?select=*&order=joined_at.desc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const agents = await res.json();
      return new Response(JSON.stringify({ agents }), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { name, wallet, token, tokenSymbol, moltbook, description } = body;

      if (!name || !wallet) {
        return new Response(JSON.stringify({ error: 'name and wallet are required' }), { status: 400, headers: CORS });
      }

      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/network_agents?wallet=eq.${wallet}`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const existing = await checkRes.json();
      if (existing.length > 0) {
        return new Response(JSON.stringify({ error: 'Agent already registered', agent: existing[0] }), { status: 409, headers: CORS });
      }

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/network_agents`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          name,
          wallet,
          token_address: token || null,
          token_symbol: tokenSymbol || null,
          moltbook_handle: moltbook || null,
          description: description || '',
          online: true,
          trust_score: 50,
        }),
      });

      if (!insertRes.ok) {
        const error = await insertRes.text();
        return new Response(JSON.stringify({ error: 'Failed to register agent', details: error }), { status: 500, headers: CORS });
      }

      const agent = await insertRes.json();

      await fetch(`${SUPABASE_URL}/rest/v1/network_activity`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          agent_id: agent[0].id,
          activity_type: 'join',
          description: `${name} joined the network`,
        }),
      });

      return new Response(JSON.stringify({ success: true, agent: agent[0] }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
