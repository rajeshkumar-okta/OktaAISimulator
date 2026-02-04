/**
 * Settings API Routes
 *
 * Provides endpoints for managing centralized Okta configurations:
 * - Organizations (Okta tenants)
 * - Applications (OAuth clients)
 * - Agents (Workload identities)
 */

import { Router } from 'express';
import * as settingsStore from '../services/settingsStore.js';

const router = Router();

// ============== Organizations ==============

/**
 * GET /api/settings/orgs
 * List all organizations
 */
router.get('/orgs', async (req, res) => {
  try {
    const orgs = await settingsStore.listOrgs();
    res.json(orgs);
  } catch (err) {
    console.error('Error listing orgs:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/orgs/:id
 * Get a single organization
 */
router.get('/orgs/:id', async (req, res) => {
  try {
    const org = await settingsStore.getOrg(req.params.id);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(org);
  } catch (err) {
    console.error('Error getting org:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/orgs
 * Create a new organization
 */
router.post('/orgs', async (req, res) => {
  try {
    const org = await settingsStore.createOrg(req.body);
    res.status(201).json(org);
  } catch (err) {
    console.error('Error creating org:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/settings/orgs/:id
 * Update an organization
 */
router.put('/orgs/:id', async (req, res) => {
  try {
    const org = await settingsStore.updateOrg(req.params.id, req.body);
    res.json(org);
  } catch (err) {
    console.error('Error updating org:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/settings/orgs/:id
 * Delete an organization
 */
router.delete('/orgs/:id', async (req, res) => {
  try {
    await settingsStore.deleteOrg(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting org:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============== Applications ==============

/**
 * GET /api/settings/apps
 * List all applications (optionally filter by orgId)
 */
router.get('/apps', async (req, res) => {
  try {
    const orgId = req.query.orgId || null;
    const apps = await settingsStore.listApps(orgId);
    res.json(apps);
  } catch (err) {
    console.error('Error listing apps:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/apps/:id
 * Get a single application
 */
router.get('/apps/:id', async (req, res) => {
  try {
    const app = await settingsStore.getApp(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(app);
  } catch (err) {
    console.error('Error getting app:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/apps/:id/with-org
 * Get application with org details resolved
 */
router.get('/apps/:id/with-org', async (req, res) => {
  try {
    const app = await settingsStore.getAppWithOrg(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(app);
  } catch (err) {
    console.error('Error getting app with org:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/apps
 * Create a new application
 */
router.post('/apps', async (req, res) => {
  try {
    const app = await settingsStore.createApp(req.body);
    res.status(201).json(app);
  } catch (err) {
    console.error('Error creating app:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/settings/apps/:id
 * Update an application
 */
router.put('/apps/:id', async (req, res) => {
  try {
    const app = await settingsStore.updateApp(req.params.id, req.body);
    res.json(app);
  } catch (err) {
    console.error('Error updating app:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/settings/apps/:id
 * Delete an application
 */
router.delete('/apps/:id', async (req, res) => {
  try {
    await settingsStore.deleteApp(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting app:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============== Agents ==============

/**
 * GET /api/settings/agents
 * List all agents (optionally filter by orgId)
 */
router.get('/agents', async (req, res) => {
  try {
    const orgId = req.query.orgId || null;
    const agents = await settingsStore.listAgents(orgId);
    res.json(agents);
  } catch (err) {
    console.error('Error listing agents:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/agents/:id
 * Get a single agent
 */
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await settingsStore.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (err) {
    console.error('Error getting agent:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/agents
 * Create a new agent
 */
router.post('/agents', async (req, res) => {
  try {
    const agent = await settingsStore.createAgent(req.body);
    res.status(201).json(agent);
  } catch (err) {
    console.error('Error creating agent:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/settings/agents/:id
 * Update an agent
 */
router.put('/agents/:id', async (req, res) => {
  try {
    const agent = await settingsStore.updateAgent(req.params.id, req.body);
    res.json(agent);
  } catch (err) {
    console.error('Error updating agent:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/settings/agents/:id
 * Delete an agent
 */
router.delete('/agents/:id', async (req, res) => {
  try {
    await settingsStore.deleteAgent(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting agent:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============== Composite Endpoints ==============

/**
 * POST /api/settings/resolve
 * Resolve a complete configuration from org/app/agent references
 */
router.post('/resolve', async (req, res) => {
  try {
    const { orgId, appId, agentId, authServerId } = req.body;
    const config = await settingsStore.resolveFlowConfig({ orgId, appId, agentId, authServerId });
    res.json(config);
  } catch (err) {
    console.error('Error resolving config:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/settings/export
 * Export all settings as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const data = await settingsStore.exportAllSettings();
    res.json(data);
  } catch (err) {
    console.error('Error exporting settings:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/import
 * Import settings from JSON
 */
router.post('/import', async (req, res) => {
  try {
    const overwrite = req.query.overwrite === 'true';
    const result = await settingsStore.importSettings(req.body, overwrite);
    res.json(result);
  } catch (err) {
    console.error('Error importing settings:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/settings/summary
 * Get a summary of all settings (for picker dropdowns)
 */
router.get('/summary', async (req, res) => {
  try {
    const [orgs, apps, agents] = await Promise.all([
      settingsStore.listOrgs(),
      settingsStore.listApps(),
      settingsStore.listAgents(),
    ]);

    // Return simplified data for picker UIs
    res.json({
      orgs: orgs.map(o => ({
        id: o.id,
        name: o.name,
        oktaDomain: o.oktaDomain,
        authServers: o.authServers || [],
      })),
      apps: apps.map(a => ({
        id: a.id,
        name: a.name,
        orgId: a.orgId,
        clientId: a.clientId,
        applicationType: a.applicationType,
        authMethod: a.authMethod,
      })),
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        orgId: a.orgId,
        principalId: a.principalId,
      })),
    });
  } catch (err) {
    console.error('Error getting settings summary:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
