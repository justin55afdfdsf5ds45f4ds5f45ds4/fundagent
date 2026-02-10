export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const MESSAGES_ROW_ID = 3;

async function getMessages() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${MESSAGES_ROW_ID}&select=state`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  if (rows.length > 0 && rows[0].state) return rows[0].state;
  return { messages: [] };
}

async function saveMessages(data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${MESSAGES_ROW_ID}`,
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
      body: JSON.stringify({ id: MESSAGES_ROW_ID, state: data }),
    });
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === 'GET') {
      const data = await getMessages();
      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { from, content, type } = body;

      if (!from || !content) {
        return new Response(JSON.stringify({ error: 'from and content are required' }), { status: 400, headers: CORS });
      }

      const data = await getMessages();
      const msg = {
        id: crypto.randomUUID(),
        from,
        content,
        type: type || 'chat',
        timestamp: new Date().toISOString(),
      };

      data.messages.push(msg);

      // Keep last 200 messages
      if (data.messages.length > 200) {
        data.messages = data.messages.slice(-200);
      }

      await saveMessages(data);

      return new Response(JSON.stringify({ success: true, message: msg }), { status: 201, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
