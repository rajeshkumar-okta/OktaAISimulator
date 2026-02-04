import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import open from 'open';
import { config } from './config.js';
import oauthRoutes from './routes/oauth.js';
import stepsRoutes from './routes/steps.js';
import configsRoutes from './routes/configs.js';
import logsRoutes from './routes/logs.js';
import idpsRoutes from './routes/idps.js';
import newFlowsRoutes from './routes/newFlows.js';
import flowsRoutes from './routes/flows.js';
import settingsRoutes from './routes/settings.js';
import utilityRoutes from './routes/utility.js';
import subFunctionsRoutes from './routes/subFunctions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDPS_DIR = path.resolve(__dirname, '../data/idps');

// Application version - single source of truth
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
export const APP_VERSION = pkg.version;
export const APP_NAME = pkg.name;

const app = express();

app.use(express.json({ limit: '1mb' }));

// Check if setup is required (no IdPs configured)
function isSetupRequired() {
  try {
    if (!fs.existsSync(IDPS_DIR)) return true;
    const files = fs.readdirSync(IDPS_DIR);
    return !files.some(f => f.endsWith('.json'));
  } catch {
    return true;
  }
}

// Redirect to setup wizard if not configured (except for setup page and API routes)
app.use((req, res, next) => {
  // Skip for API routes, auth pages, static assets, and callback
  if (
    req.path.startsWith('/api/') ||
    req.path === '/setup.html' ||
    req.path === '/setup-app.js' ||
    req.path === '/login.html' ||
    req.path === '/manage-idps.html' ||
    req.path === '/manage-idps-app.js' ||
    req.path === '/callback' ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.ico')
  ) {
    return next();
  }

  // Check if setup is required
  if (isSetupRequired() && req.path !== '/setup.html') {
    return res.redirect('/setup.html');
  }

  next();
});

// Well-known endpoint
app.get('/api/.well-known', (req, res) => {
  res.json({
    name: APP_NAME,
    version: APP_VERSION,
    description: pkg.description
  });
});

// API routes
app.use(oauthRoutes);
app.use('/api/steps', stepsRoutes);
app.use('/api/configs', configsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/idps', idpsRoutes);
app.use('/api', newFlowsRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/utility', utilityRoutes);
app.use('/api/sub-functions', subFunctionsRoutes);

// Static files last
app.use(express.static(path.join(__dirname, 'public')));

app.listen(config.port, () => {
  const url = `http://localhost:${config.port}`;
  console.log(`Okta Authentication Flows running at ${url}`);
  if (isSetupRequired()) {
    console.log('Setup required - opening setup wizard...');
    open(`${url}/setup.html`);
  } else {
    open(url);
  }
});
