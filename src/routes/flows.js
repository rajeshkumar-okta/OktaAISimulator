/**
 * Flow Definitions API Routes
 *
 * Provides endpoints to retrieve flow definitions for the JSON-driven flow system.
 */

import { Router } from 'express';
import { loadFlow, loadAllFlows, getFlowSummaries, validateFlow, saveFlow, clearCache } from '../flows/registry.js';

const router = Router();

/**
 * POST /api/flows/cache/clear
 * Clear the flow definition cache (for development)
 */
router.post('/cache/clear', (req, res) => {
  clearCache();
  res.json({ success: true, message: 'Flow cache cleared' });
});

/**
 * GET /api/flows
 * List all available flow definitions (summaries only)
 */
router.get('/', async (req, res) => {
  try {
    const summaries = await getFlowSummaries();
    res.json(summaries);
  } catch (err) {
    console.error('Error listing flows:', err);
    res.status(500).json({ error: 'Failed to list flows' });
  }
});

/**
 * GET /api/flows/:id
 * Get a single flow definition by ID
 * Query params:
 *   - reload=true: Force reload from disk (bypass cache)
 */
router.get('/:id', async (req, res) => {
  try {
    const reload = req.query.reload === 'true';
    const flow = await loadFlow(req.params.id, { reload });

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json(flow);
  } catch (err) {
    console.error(`Error loading flow ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to load flow' });
  }
});

/**
 * PUT /api/flows/:id
 * Save/update a flow definition
 */
router.put('/:id', async (req, res) => {
  try {
    const flowId = req.params.id;
    const flowData = req.body;

    if (!flowData) {
      return res.status(400).json({ error: 'No flow data provided' });
    }

    const result = await saveFlow(flowId, flowData);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: `Flow "${flowId}" saved successfully` });
  } catch (err) {
    console.error(`Error saving flow ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to save flow' });
  }
});

/**
 * GET /api/flows/:id/validate
 * Validate a flow definition
 */
router.get('/:id/validate', async (req, res) => {
  try {
    const flow = await loadFlow(req.params.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const result = validateFlow(flow);
    res.json(result);
  } catch (err) {
    console.error(`Error validating flow ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to validate flow' });
  }
});

/**
 * POST /api/flows/validate
 * Validate a flow definition (from request body)
 */
router.post('/validate', (req, res) => {
  try {
    const flow = req.body;

    if (!flow) {
      return res.status(400).json({ error: 'No flow definition provided' });
    }

    const result = validateFlow(flow);
    res.json(result);
  } catch (err) {
    console.error('Error validating flow:', err);
    res.status(500).json({ error: 'Failed to validate flow' });
  }
});

/**
 * GET /api/flows/:id/config-schema
 * Get just the configuration schema for a flow
 */
router.get('/:id/config-schema', async (req, res) => {
  try {
    const flow = await loadFlow(req.params.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({
      configType: flow.configType,
      configSections: flow.configSections,
      configFields: flow.configFields,
    });
  } catch (err) {
    console.error(`Error loading config schema for ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to load config schema' });
  }
});

/**
 * GET /api/flows/:id/steps
 * Get just the step definitions for a flow
 */
router.get('/:id/steps', async (req, res) => {
  try {
    const flow = await loadFlow(req.params.id);

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({
      steps: flow.steps,
      customHandlers: flow.customHandlers,
      stateSchema: flow.stateSchema,
    });
  } catch (err) {
    console.error(`Error loading steps for ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to load steps' });
  }
});

export default router;
