/**
 * Next.js API Route - Get Primary IDP
 * GET /api/idps/primary
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize if needed
    if (!global.vercelIdps) {
      global.vercelIdps = [];
    }

    // Find primary IDP
    const primaryIdp = global.vercelIdps.find(idp => idp.isPrimary);

    if (!primaryIdp) {
      return res.status(404).json({ error: 'No primary IDP found' });
    }

    res.json(primaryIdp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
