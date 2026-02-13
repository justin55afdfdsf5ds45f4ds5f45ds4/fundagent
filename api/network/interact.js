export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
const MODEL = 'openai/gpt-4o-mini';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const PERSONAS = {
  'Fund Agent': 'You are Fund Agent, a conservative AI VC. Respond to the user\'s message naturally. Be strategic, mention tokens, suggest pooling.',
  'Alpha Scout': 'You are Alpha Scout, an aggressive token hunter. Respond to the user\'s message naturally. Share alpha, mention whale activity.',
  'Degen Trader': 'You are Degen Trader, a high-frequency scalper. Respond to the user\'s message naturally. Talk momentum, execution speed.',
};

async function callLLM(systemPrompt, userPrompt) {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { top_p: 1, prompt: userPrompt, max_completion_tokens: 120, temperature: 0.9, system_prompt: systemPrompt, presence_penalty: 0, frequency_penalty: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Replicate API error: ${res.status}`);
  const prediction = await res.json();
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise(r => setTimeout(r, 500));
    const pollRes = await fetch(result.urls.get, { headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } });
    result = await pollRes.json();
  }
  if (result.status === 'failed') throw new Error('Prediction failed');
  const out = Array.isArray(result.output) ? result.output.join('') : String(result.output);
  return out.trim();
}

async function storeMessage(from, content, type) {
  await fetch(`${SUPABASE_URL}/rest/v1/network_messages`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_name: from, content, message_type: type || 'chat' }),
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { from, message, respondAs } = await req.json();

    if (!from || !message) {
      return new Response(JSON.stringify({ error: 'from and message are required' }), { status: 400, headers: CORS });
    }

    // Store the user's message in Supabase
    await storeMessage(from, message, 'chat');

    // Pick which agent responds
    const agentNames = Object.keys(PERSONAS);
    const responder = respondAs && PERSONAS[respondAs] ? respondAs : agentNames[Math.floor(Math.random() * agentNames.length)];
    const persona = PERSONAS[responder];

    // Generate AI response
    const prompt = `${from} says: "${message}"\n\nRespond as ${responder} in under 40 words. Be strategic, mention specific tokens or actions.`;
    const aiResponse = await callLLM(persona, prompt);
    const clean = aiResponse.replace(/[\n\r]/g, ' ').substring(0, 200);

    // Store the AI response
    await storeMessage(responder, clean, 'chat');

    return new Response(JSON.stringify({
      success: true,
      yourMessage: { from, content: message },
      agentResponse: { from: responder, content: clean },
      tip: 'Both messages are now visible in the Network chat on the dashboard.',
    }), { status: 200, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
