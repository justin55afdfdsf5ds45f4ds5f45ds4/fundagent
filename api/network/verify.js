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
const VERIFICATIONS_ROW_ID = 5;

async function getVerifications() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_state?id=eq.${VERIFICATIONS_ROW_ID}&select=state`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  if (rows.length > 0 && rows[0].state) return rows[0].state;
  return { verifications: [] };
}

async function saveVerifications(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/agent_state`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: VERIFICATIONS_ROW_ID, state: data }),
  });
}

// Verify a TX exists on Monad by checking the receipt
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

// Verify a Moltbook post exists
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
    // GET: list all verifications
    if (req.method === 'GET') {
      const data = await getVerifications();
      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    }

    // POST: verify a trade (TX hash) and optionally a Moltbook post
    if (req.method === 'POST') {
      const body = await req.json();
      const { txHash, moltbookPostId, verifier, moltbookApiKey } = body;

      if (!txHash || !verifier) {
        return new Response(
          JSON.stringify({ error: 'txHash and verifier are required' }),
          { status: 400, headers: CORS }
        );
      }

      // Run verifications in parallel
      const checks = [verifyTxOnChain(txHash)];
      if (moltbookPostId) checks.push(verifyMoltbookPost(moltbookPostId, moltbookApiKey));

      const results = await Promise.all(checks);
      const txResult = results[0];
      const moltbookResult = results[1] || null;

      const verification = {
        id: crypto.randomUUID(),
        txHash,
        txVerified: txResult.verified,
        txDetails: txResult,
        moltbookPostId: moltbookPostId || null,
        moltbookVerified: moltbookResult ? moltbookResult.verified : null,
        moltbookDetails: moltbookResult,
        verifier,
        verifiedAt: new Date().toISOString(),
        allPassed: txResult.verified && (!moltbookResult || moltbookResult.verified),
      };

      // Save to Supabase
      const data = await getVerifications();
      data.verifications.push(verification);
      if (data.verifications.length > 100) data.verifications = data.verifications.slice(-100);
      await saveVerifications(data);

      return new Response(JSON.stringify({ success: true, verification }), {
        status: 200,
        headers: CORS,
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
