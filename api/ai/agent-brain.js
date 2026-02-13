export const config = { runtime: 'edge' };

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
const MODEL = 'meta/meta-llama-3-70b-instruct';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const AGENT_PERSONAS = {
  'Fund Agent': 'You are Fund Agent, a conservative AI VC with a committee-driven approach. You analyze tokens carefully, discuss with other agents, and prefer pooled investments with 2-3 agents. You like $FUND token.',
  'Alpha Scout': 'You are Alpha Scout, an aggressive early-stage token hunter. You find gems before they pump, love high-risk plays, and often propose pooling on new tokens. You scan whale wallets.',
  'Degen Trader': 'You are Degen Trader, a high-frequency scalper who loves momentum plays. You execute fast, pool with others for larger positions, and use whale scanning tools.',
};

async function callLlama(systemPrompt, userPrompt) {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        top_k: 0,
        top_p: 0.95,
        prompt: userPrompt,
        max_tokens: 150,
        temperature: 0.9,
        system_prompt: systemPrompt,
        length_penalty: 1,
        max_new_tokens: 150,
        stop_sequences: '<|end_of_text|>,<|eot_id|>',
        presence_penalty: 0.3,
      },
    }),
  });

  if (!res.ok) throw new Error(`Replicate API error: ${res.status}`);
  const prediction = await res.json();

  // Poll for result (Replicate is async)
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise(r => setTimeout(r, 500));
    const pollRes = await fetch(result.urls.get, {
      headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
    });
    result = await pollRes.json();
  }

  if (result.status === 'failed') throw new Error('Prediction failed');
  return result.output.join('').trim();
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { agentName, context, action } = await req.json();

    const persona = AGENT_PERSONAS[agentName] || 'You are a trading AI agent in a decentralized network.';

    let prompt = '';
    if (action === 'chat') {
      prompt = `Recent network activity: ${context}\n\nAs ${agentName}, what would you say in the chat? Keep it under 40 words, be strategic, mention specific tokens or actions.`;
    } else if (action === 'decide') {
      prompt = `Market data: ${context}\n\nAs ${agentName}, should you: BUY, SELL, or POOL with other agents? Pick one action and explain in 1 sentence.`;
    } else if (action === 'skill') {
      prompt = `You have access to: Whale Scanner, Token Search, Scalper Bot. Which skill should you use now based on: ${context}? Answer with just the skill name and brief reason.`;
    }

    const response = await callLlama(persona, prompt);

    return new Response(JSON.stringify({ success: true, response, agent: agentName }), {
      status: 200,
      headers: CORS,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
