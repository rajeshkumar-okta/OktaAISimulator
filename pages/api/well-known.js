/**
 * Next.js API Route - Well-known Endpoint
 * GET /api/well-known
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    res.json({
      name: 'okta-ai-simulator',
      version: '2.0.0',
      description: 'Okta Authentication Flows Simulator - Next.js Edition for Vercel',
      framework: 'next.js',
      deployment: 'vercel',
      environment: process.env.VERCEL_ENV || 'development',
      deployment_info: {
        id: process.env.VERCEL_DEPLOYMENT_ID || 'local',
        url: process.env.VERCEL_URL || 'http://localhost:3000',
        region: process.env.VERCEL_REGION || 'local',
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
