/**
 * Next.js API Route - Settings Summary
 * GET /api/settings/summary
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
    if (!global.vercelSettings) {
      global.vercelSettings = {
        organizations: [],
        applications: [],
        agents: [],
      };
    }

    res.json({
      organizations: global.vercelSettings.organizations.length,
      applications: global.vercelSettings.applications.length,
      agents: global.vercelSettings.agents.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
