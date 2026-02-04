/**
 * Next.js API Route - Device Authorization
 * POST /api/device/authorize
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
      device_code: 'stub_device_code_' + Date.now(),
      user_code: 'ABCD-1234',
      verification_uri: 'https://device.okta.com/activate',
      expires_in: 600,
      interval: 5,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
