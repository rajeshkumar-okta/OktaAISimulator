/**
 * Next.js API Route - Direct Auth Authenticate
 * POST /api/direct-auth/authenticate
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
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'SUCCESS',
      sessionToken: 'stub_session_' + Date.now(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
