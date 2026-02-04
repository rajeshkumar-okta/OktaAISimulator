/**
 * Next.js API Route - Direct Auth MFA
 * POST /api/direct-auth/mfa
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
      status: 'MFA_REQUIRED',
      factors: [
        {
          id: 'stub_factor_okta_push',
          factorType: 'push',
          provider: { name: 'OKTA' },
        },
        {
          id: 'stub_factor_okta_otp',
          factorType: 'token:software:totp',
          provider: { name: 'OKTA' },
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
