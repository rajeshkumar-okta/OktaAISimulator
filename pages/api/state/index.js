import * as store from '../../../src/state/sessionStore-serverless';

/**
 * Next.js API Route - State
 * GET/POST/DELETE /api/state
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
    if (req.method === 'GET') {
      // Get current state
      res.json(store.getState());
    } else if (req.method === 'POST') {
      // Update state
      const { key, value, state } = req.body;
      
      let updated;
      if (state) {
        // Replace entire state
        updated = store.setState(state);
      } else if (key && value !== undefined) {
        // Update single property
        updated = store.updateState(key, value);
      } else {
        return res.status(400).json({ error: 'Provide either state object or key/value pair' });
      }
      
      res.json(updated);
    } else if (req.method === 'DELETE') {
      // Reset state
      const reset = store.resetState();
      res.json({ success: true, state: reset });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
