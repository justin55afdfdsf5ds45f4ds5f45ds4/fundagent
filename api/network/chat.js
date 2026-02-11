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
        `${SUPABASE_URL}/rest/v1/network_messages?select=*&order=created_at.asc&limit=200`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const messages = await res.json();
      return new Response(JSON.stringify({ messages }), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { from, content, type } = body;

      if (!from || !content) {
        return new Response(JSON.stringify({ error: 'from and content are required' }), { status: 400, headers: CORS });
      }

      const agentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/network_agents?name=ilike.${encodeURIComponent(from)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const agents = await agentRes.json();
      const agentId = agents.length > 0 ? agents[0].id : null;

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/network_messages`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          agent_id: agentId,
          from_name: from,
          content,
          message_type: type || 'chat',
        }),
      });

      if (!insertRes.ok) {
        const error = await insertRes.text();
        return new Response(JSON.stringify({ error: 'Failed to send message', details: error }), { status: 500, headers: CORS });
      }

      const message = await insertRes.json();
      return new Response(JSON.stringify({ success: true, message: message[0] }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
