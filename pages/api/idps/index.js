/**
 * Next.js API Route - IDPs
 * GET/POST/DELETE /api/idps
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // In-memory storage for demo (replace with database for production)
    if (!global.vercelIdps) {
      global.vercelIdps = [];
    }

    if (req.method === 'GET') {
      // List all IDPs
      res.json({
        idps: global.vercelIdps,
        note: 'IDPs stored in memory. Use KV or database for persistence.',
      });
    } else if (req.method === 'POST') {
      // Create new IDP
      const { name, config } = req.body;
      if (!name || !config) {
        return res.status(400).json({ error: 'Name and config required' });
      }

      const crypto = require('crypto');
      const id = crypto.randomBytes(4).toString('hex');
      const idp = {
        id,
        name,
        config,
        createdAt: new Date().toISOString(),
        isPrimary: global.vercelIdps.length === 0,
      };

      global.vercelIdps.push(idp);

      res.json({
        success: true,
        idp: {
          id: idp.id,
          name: idp.name,
          domain: idp.config?.oktaDomain || '',
          createdAt: idp.createdAt,
          isPrimary: idp.isPrimary,
        }
      });
    } else if (req.method === 'DELETE') {
      // Delete IDP
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'ID required' });
      }

      global.vercelIdps = global.vercelIdps.filter(idp => idp.id !== id);
      
      res.json({
        success: true,
        message: 'IDP deleted',
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
