/**
 * Vercel Serverless API Handler - Configs
 * Note: On Vercel, configs are stored in /tmp (ephemeral) or environment
 * For persistent storage, use Vercel KV or a database
 */

import * as store from '../../src/state/sessionStore-serverless.js';

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
        message: 'Note: On Vercel, configs are stored in memory (per request). For persistence, configure a database or use browser storage.',
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
        message: 'Config saved to session (ephemeral on Vercel)',
      });
    } else if (req.method === 'GET' && req.query.id) {
      // Get specific config
      const state = store.getState();
      if (state.cfg) {
        res.json({ id: 'current', ...state.cfg });
      } else {
        res.status(404).json({ error: 'Config not found' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
