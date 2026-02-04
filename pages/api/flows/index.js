/**
 * Next.js API Route - Flows
 * GET/POST/PUT/DELETE /api/flows
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
    // Initialize global flows storage if needed
    if (!global.vercelFlows) {
      global.vercelFlows = [];
    }

    if (req.method === 'GET') {
      // List all flows
      res.json({
        flows: global.vercelFlows,
        builtInFlows: [
          'auth-code-flow',
          'agentic-token-exchange',
          'device-grant-flow',
          'token-exchange-flow',
          'native-to-web-flow',
          'direct-auth-flow',
        ],
        note: 'Custom flows stored in memory. Use database for persistence.',
      });
    } else if (req.method === 'POST') {
      // Create new flow
      const { name, definition } = req.body;
      
      if (!name || !definition) {
        return res.status(400).json({ error: 'Name and definition required' });
      }

      const crypto = require('crypto');
      const id = crypto.randomBytes(4).toString('hex');
      const flow = {
        id,
        name,
        definition,
        createdAt: new Date().toISOString(),
        custom: true,
      };

      global.vercelFlows.push(flow);

      res.json({
        success: true,
        flow: {
          id: flow.id,
          name: flow.name,
          createdAt: flow.createdAt,
        }
      });
    } else if (req.method === 'PUT') {
      // Update flow
      const { id, name, definition } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'ID required' });
      }

      const index = global.vercelFlows.findIndex(f => f.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Flow not found' });
      }

      if (name) global.vercelFlows[index].name = name;
      if (definition) global.vercelFlows[index].definition = definition;
      global.vercelFlows[index].updatedAt = new Date().toISOString();

      res.json({
        success: true,
        flow: global.vercelFlows[index],
      });
    } else if (req.method === 'DELETE') {
      // Delete flow
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: 'ID required' });
      }

      global.vercelFlows = global.vercelFlows.filter(f => f.id !== id);
      
      res.json({
        success: true,
        message: 'Flow deleted',
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
