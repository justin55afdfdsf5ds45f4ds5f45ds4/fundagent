export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_state?id=eq.1&select=state`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    const rows = await res.json();
    if (rows.length > 0 && rows[0].state) {
      return new Response(JSON.stringify(rows[0].state), {
        status: 200,
        headers: { ...CORS, 'Cache-Control': 'public, s-maxage=30' },
      });
    }
    return new Response(JSON.stringify({ status: 'offline', error: 'No state found' }), {
      status: 200,
      headers: CORS,
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'offline', error: 'Cloud sync unavailable' }), {
      status: 200,
      headers: CORS,
    });
  }
}
