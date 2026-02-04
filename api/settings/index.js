/**
 * Vercel Serverless API Handler - Settings
 * Manages organization, app, and agent settings
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Initialize global settings storage if needed
    if (!global.vercelSettings) {
      global.vercelSettings = {
        organizations: [],
        applications: [],
        agents: [],
      };
    }

    const { type } = req.query; // 'organizations', 'applications', 'agents'

    if (req.method === 'GET') {
      if (type && global.vercelSettings[type]) {
        res.json({
          items: global.vercelSettings[type],
          type,
          note: 'Settings stored in memory. Use database for persistence.',
        });
      } else {
        res.json({
          ...global.vercelSettings,
          note: 'Settings stored in memory. Use database for persistence.',
        });
      }
    } else if (req.method === 'POST') {
      const { item } = req.body;
      
      if (!type || !item) {
        return res.status(400).json({ error: 'Type and item required' });
      }

      if (!global.vercelSettings[type]) {
        return res.status(400).json({ error: 'Invalid type' });
      }

      const id = require('crypto').randomBytes(4).toString('hex');
      const newItem = {
        id,
        ...item,
        createdAt: new Date().toISOString(),
      };

      global.vercelSettings[type].push(newItem);

      res.json({
        success: true,
        item: newItem,
      });
    } else if (req.method === 'PUT') {
      // Update item
      const { id, item } = req.body;
      
      if (!type || !id || !item) {
        return res.status(400).json({ error: 'Type, id, and item required' });
      }

      const index = global.vercelSettings[type].findIndex(i => i.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Item not found' });
      }

      global.vercelSettings[type][index] = {
        ...global.vercelSettings[type][index],
        ...item,
        updatedAt: new Date().toISOString(),
      };

      res.json({
        success: true,
        item: global.vercelSettings[type][index],
      });
    } else if (req.method === 'DELETE') {
      // Delete item
      const { id } = req.body;
      
      if (!type || !id) {
        return res.status(400).json({ error: 'Type and id required' });
      }

      global.vercelSettings[type] = global.vercelSettings[type].filter(i => i.id !== id);

      res.json({
        success: true,
        message: 'Item deleted',
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
