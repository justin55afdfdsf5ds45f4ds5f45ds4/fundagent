export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
const MODEL = 'meta/meta-llama-3-70b-instruct';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Fetch real Reddit posts about the token / Monad ecosystem
async function fetchRedditPosts(token) {
  const clean = token.replace('$', '');
  const queries = [
    `${clean} monad crypto`,
    `${clean} token blockchain`,
    'monad blockchain DeFi token',
    'monad memecoin trading',
  ];
  const allPosts = [];

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=5&t=month`,
        { headers: { 'User-Agent': 'EmpusaAI-SentimentBot/1.0 (trading-agent-network)' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.data && data.data.children) {
        for (const c of data.data.children) {
          const d = c.data;
          if (d.selftext || d.title) {
            allPosts.push({
              source: 'Reddit',
              subreddit: 'r/' + d.subreddit,
              author: 'u/' + d.author,
              title: d.title,
              text: (d.selftext || '').substring(0, 200),
              url: 'https://reddit.com' + d.permalink,
              upvotes: d.score,
              time: new Date(d.created_utc * 1000).toISOString(),
            });
          }
        }
      }
    } catch (_) {}
    if (allPosts.length >= 8) break;
  }

  const seen = new Set();
  return allPosts.filter(p => {
    if (seen.has(p.title)) return false;
    seen.add(p.title);
    return true;
  }).slice(0, 8);
}

// Fetch real messages from our own network mentioning the token
async function fetchNetworkMessages(token) {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  try {
    const clean = token.replace('$', '');
    // Try token-specific messages first
    let res = await fetch(
      `${SUPABASE_URL}/rest/v1/network_messages?or=(content.ilike.*${encodeURIComponent(clean)}*,content.ilike.*${encodeURIComponent(token)}*)&select=from_name,content,created_at&order=created_at.desc&limit=5`,
      { headers }
    );
    let msgs = res.ok ? await res.json() : [];

    // Fallback: get recent trade signals + chats as general market context
    if (!Array.isArray(msgs) || msgs.length === 0) {
      res = await fetch(
        `${SUPABASE_URL}/rest/v1/network_messages?select=from_name,content,created_at&order=created_at.desc&limit=10`,
        { headers }
      );
      msgs = res.ok ? await res.json() : [];
    }

    return (Array.isArray(msgs) ? msgs : []).map(m => ({
      source: 'EmpusaAI Network',
      author: m.from_name,
      text: m.content,
      time: m.created_at,
    }));
  } catch (_) { return []; }
}

// Run AI sentiment analysis on collected posts
async function runAnalysis(posts, token) {
  const postsText = posts.map((p, i) => {
    const src = p.source === 'Reddit' ? `[Reddit ${p.subreddit}] ${p.author}` : `[${p.source}] ${p.author}`;
    const text = p.title ? `${p.title}. ${p.text}` : p.text;
    return `${i + 1}. ${src}: "${text.substring(0, 200)}"`;
  }).join('\n');

  const prompt = `You are analyzing real social media posts about the crypto token ${token} on Monad blockchain.

POSTS:
${postsText}

For each post:
- Rate: BULLISH, BEARISH, or NEUTRAL
- One sentence why

Then give:
OVERALL SCORE: [0-100] (0=extremely bearish, 100=extremely bullish)
RECOMMENDATION: BUY / SELL / HOLD
CONFIDENCE: [0-100]%
SUMMARY: One sentence market sentiment summary

Be precise and analytical. Base your analysis ONLY on what the posts actually say.`;

  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        prompt,
        system_prompt: 'You are a professional crypto market sentiment analyst. Analyze posts objectively. Be concise.',
        max_tokens: 400,
        temperature: 0.2,
        top_p: 0.9,
        stop_sequences: '<|end_of_text|>,<|eot_id|>',
      },
    }),
  });

  if (!res.ok) throw new Error(`Replicate error: ${res.status}`);
  const prediction = await res.json();
  let result = prediction;

  // Poll for completion (max 30s)
  const deadline = Date.now() + 30000;
  while (result.status !== 'succeeded' && result.status !== 'failed' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800));
    const pollRes = await fetch(result.urls.get, { headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } });
    result = await pollRes.json();
  }

  if (result.status === 'failed') throw new Error('Analysis failed');
  if (result.status !== 'succeeded') throw new Error('Analysis timed out');

  return result.output.join('').trim();
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'token is required' }), { status: 400, headers: CORS });
    }

    // Fetch from multiple real sources in parallel
    const [redditPosts, networkPosts] = await Promise.all([
      fetchRedditPosts(token),
      fetchNetworkMessages(token),
    ]);

    const allPosts = [...redditPosts, ...networkPosts];

    if (allPosts.length === 0) {
      return new Response(JSON.stringify({
        token,
        posts: [],
        analysis: 'No posts found for this token. Insufficient data for sentiment analysis.',
        score: 50,
        sources: { reddit: 0, network: 0 },
      }), { status: 200, headers: CORS });
    }

    // Run AI analysis on real posts
    const analysis = await runAnalysis(allPosts, token);

    // Extract score from analysis text
    let score = 50;
    const scoreMatch = analysis.match(/OVERALL SCORE:\s*(\d+)/i);
    if (scoreMatch) score = parseInt(scoreMatch[1]);

    return new Response(JSON.stringify({
      token,
      posts: allPosts,
      analysis,
      score,
      sources: { reddit: redditPosts.length, network: networkPosts.length },
      analyzedAt: new Date().toISOString(),
    }), { status: 200, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
