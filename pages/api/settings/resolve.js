/**
 * Next.js API Route - Resolve Settings
 * POST /api/settings/resolve
 */
export default async function handler(req, res) {
  // Enable CORS
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
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: 'key and value required' });
    }

    if (!global.vercelSettings) {
      global.vercelSettings = {
        organizations: [],
        applications: [],
        agents: [],
      };
    }

    // Simple resolution - return the matching item
    for (const type of ['organizations', 'applications', 'agents']) {
      const items = global.vercelSettings[type] || [];
      const match = items.find(item => item[key] === value);
      if (match) {
        return res.json(match);
      }
    }

    res.status(404).json({ error: `${key}=${value} not found` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
