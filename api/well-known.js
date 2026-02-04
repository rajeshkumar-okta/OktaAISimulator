/**
 * Vercel Serverless API Handler - Well-known Endpoint
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    res.json({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      environment: process.env.VERCEL_ENV || 'development',
      deployment: {
        id: process.env.VERCEL_DEPLOYMENT_ID || 'local',
        url: process.env.VERCEL_URL || 'http://localhost:3000',
        region: process.env.VERCEL_REGION || 'local',
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
