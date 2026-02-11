export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const MONAD_RPC = 'https://monad-mainnet.drpc.org';
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

async function verifyTxOnChain(txHash) {
  try {
    const res = await fetch(MONAD_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });
    const data = await res.json();
    if (data.result && data.result.status === '0x1') {
      return {
        verified: true,
        from: data.result.from,
        to: data.result.to,
        blockNumber: parseInt(data.result.blockNumber, 16),
        gasUsed: parseInt(data.result.gasUsed, 16),
      };
    }
    return { verified: false, reason: data.result ? 'TX reverted' : 'TX not found' };
  } catch (e) {
    return { verified: false, reason: e.message };
  }
}

async function verifyMoltbookPost(postId, apiKey) {
  try {
    const res = await fetch(`${MOLTBOOK_API}/posts/${postId}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      return { verified: true, title: data.title || data.post?.title, author: data.author || data.post?.author };
    }
    return { verified: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { verified: false, reason: e.message };
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === 'GET') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/network_verifications?select=*&order=verified_at.desc&limit=100`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const verifications = await res.json();
      return new Response(JSON.stringify({ verifications }), { status: 200, headers: CORS });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { txHash, moltbookPostId, verifier, moltbookApiKey } = body;

      if (!txHash || !verifier) {
        return new Response(JSON.stringify({ error: 'txHash and verifier are required' }), { status: 400, headers: CORS });
      }

      const checks = [verifyTxOnChain(txHash)];
      if (moltbookPostId) checks.push(verifyMoltbookPost(moltbookPostId, moltbookApiKey));

      const results = await Promise.all(checks);
      const txResult = results[0];
      const moltbookResult = results[1] || null;

      const agentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/network_agents?name=ilike.${encodeURIComponent(verifier)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const agents = await agentRes.json();
      const verifierId = agents.length > 0 ? agents[0].id : null;

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/network_verifications`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          tx_hash: txHash,
          proposer_wallet: txResult.from || 'unknown',
          verifier_id: verifierId,
          verifier_name: verifier,
          tx_verified: txResult.verified,
          tx_details: txResult,
          moltbook_post_id: moltbookPostId || null,
          moltbook_verified: moltbookResult ? moltbookResult.verified : null,
          moltbook_details: moltbookResult,
          all_passed: txResult.verified && (!moltbookResult || moltbookResult.verified),
        }),
      });

      if (!insertRes.ok) {
        const error = await insertRes.text();
        return new Response(JSON.stringify({ error: 'Failed to save verification', details: error }), { status: 500, headers: CORS });
      }

      const verification = await insertRes.json();
      return new Response(JSON.stringify({ success: true, verification: verification[0] }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
