export const config = { runtime: 'edge' };

export default async function handler() {
  try {
    const res = await fetch('https://jsonblob.com/api/jsonBlob/019c3de9-781c-7bb3-9e49-755216657e1f');
    const data = await res.text();
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=30',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'offline', error: 'Cloud sync unavailable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
