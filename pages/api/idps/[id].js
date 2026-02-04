/**
 * Next.js API Route - Get/Update/Delete Single IDP
 * GET/PUT/DELETE /api/idps/[id]
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID required' });
  }

  try {
    // Initialize if needed
    if (!global.vercelIdps) {
      global.vercelIdps = [];
    }

    if (req.method === 'GET') {
      // Get single IDP
      const idp = global.vercelIdps.find(i => i.id === id);
      if (!idp) {
        return res.status(404).json({ error: 'IDP not found' });
      }
      res.json(idp);
    } else if (req.method === 'PUT') {
      // Update IDP
      const idp = global.vercelIdps.find(i => i.id === id);
      if (!idp) {
        return res.status(404).json({ error: 'IDP not found' });
      }

      const { name, config, isPrimary } = req.body;
      if (name) idp.name = name;
      if (config) idp.config = config;
      if (isPrimary !== undefined) idp.isPrimary = isPrimary;
      idp.updatedAt = new Date().toISOString();

      res.json({
        success: true,
        idp,
      });
    } else if (req.method === 'DELETE') {
      // Delete IDP
      const index = global.vercelIdps.findIndex(i => i.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'IDP not found' });
      }

      global.vercelIdps.splice(index, 1);
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
