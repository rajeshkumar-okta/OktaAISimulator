/**
 * Next.js API Route - Native to Web Exchange
 * POST /api/native-to-web/exchange
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    res.json({
      access_token: 'stub_token_' + Date.now(),
      token_type: 'Bearer',
      expires_in: 3600,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
