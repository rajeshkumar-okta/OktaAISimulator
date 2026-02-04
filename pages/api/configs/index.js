import * as store from '../../../src/state/sessionStore-serverless';

/**
 * Next.js API Route - Configs
 * GET/POST /api/configs
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
    if (req.method === 'GET') {
      // Get current config from session store
      const state = store.getState();
      const configs = state.cfg ? [{ id: 'current', ...state.cfg }] : [];
      
      res.json({
        configs,
        message: 'Note: Configs stored in memory. For persistence, use database or Vercel KV.',
      });
    } else if (req.method === 'POST') {
      // Save config to session store
      const { config } = req.body;
      if (!config) {
        return res.status(400).json({ error: 'Config is required' });
      }
      
      store.updateState('cfg', config);
      
      res.json({
        id: 'current',
        ...config,
        message: 'Config saved to session',
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
