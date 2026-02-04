/**
 * Flow Registry - Loads and manages flow definitions
 *
 * Provides functions to load flow definitions from JSON files
 * and register them for use by the application.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for loaded flow definitions
const flowCache = new Map();

/**
 * Load a single flow definition by ID
 * @param {string} flowId - Flow identifier (e.g., 'device-grant')
 * @param {object} options - Load options
 * @param {boolean} options.reload - Force reload from disk (bypass cache)
 * @returns {Promise<object|null>} - Flow definition or null if not found
 */
export async function loadFlow(flowId, options = {}) {
  // Check cache first (unless reload is requested)
  if (!options.reload && flowCache.has(flowId)) {
    return flowCache.get(flowId);
  }

  const definitionsDir = path.join(__dirname, 'definitions');
  const filePath = path.join(definitionsDir, `${flowId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const flow = JSON.parse(content);

    // Validate required fields
    if (!flow.id || !flow.name || !flow.steps) {
      console.warn(`Invalid flow definition: ${flowId} - missing required fields`);
      return null;
    }

    // Cache the flow
    flowCache.set(flowId, flow);
    return flow;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`Flow definition not found: ${flowId}`);
    } else {
      console.error(`Error loading flow ${flowId}:`, err);
    }
    return null;
  }
}

/**
 * Load all available flow definitions
 * @returns {Promise<Array<object>>} - Array of flow definitions
 */
export async function loadAllFlows() {
  const definitionsDir = path.join(__dirname, 'definitions');

  try {
    const files = await fs.readdir(definitionsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const flows = [];
    for (const file of jsonFiles) {
      const flowId = path.basename(file, '.json');
      const flow = await loadFlow(flowId);
      if (flow) {
        flows.push(flow);
      }
    }

    return flows;
  } catch (err) {
    console.error('Error loading flows:', err);
    return [];
  }
}

/**
 * Get flow summaries for dashboard display
 * @returns {Promise<Array<object>>} - Array of flow summary objects
 */
export async function getFlowSummaries() {
  const flows = await loadAllFlows();

  return flows.map(flow => ({
    id: flow.id,
    name: flow.name,
    subtitle: flow.subtitle,
    description: flow.description,
    icon: flow.icon,
    category: flow.category,
    tags: flow.tags,
    status: flow.status,
    state: flow.state || 'draft',
    documentation: flow.documentation,
  }));
}

/**
 * Save a flow definition to disk
 * @param {string} flowId - Flow identifier
 * @param {object} flowData - Flow definition object
 * @returns {Promise<object>} - { success: boolean, error?: string }
 */
export async function saveFlow(flowId, flowData) {
  // Validate the flow before saving
  const validation = validateFlow(flowData);
  if (!validation.valid) {
    return { success: false, error: `Invalid flow: ${validation.errors.join(', ')}` };
  }

  // Ensure the flow ID matches
  if (flowData.id !== flowId) {
    return { success: false, error: 'Flow ID in data does not match the requested ID' };
  }

  const definitionsDir = path.join(__dirname, 'definitions');
  const filePath = path.join(definitionsDir, `${flowId}.json`);

  try {
    // Write the flow to disk with pretty formatting
    const content = JSON.stringify(flowData, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');

    // Update the cache
    flowCache.set(flowId, flowData);

    return { success: true };
  } catch (err) {
    console.error(`Error saving flow ${flowId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Clear the flow cache (useful for development/hot reload)
 */
export function clearCache() {
  flowCache.clear();
}

/**
 * Get cached flow (without loading from disk)
 * @param {string} flowId - Flow identifier
 * @returns {object|null}
 */
export function getCachedFlow(flowId) {
  return flowCache.get(flowId) || null;
}

/**
 * Validate a flow definition against the schema
 * @param {object} flow - Flow definition object
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validateFlow(flow) {
  const errors = [];

  // Required fields
  if (!flow.id) errors.push('Missing required field: id');
  if (!flow.name) errors.push('Missing required field: name');
  if (!flow.configType) errors.push('Missing required field: configType');
  if (!flow.steps || !Array.isArray(flow.steps)) {
    errors.push('Missing or invalid required field: steps (must be array)');
  }

  // Validate steps
  if (flow.steps) {
    flow.steps.forEach((step, index) => {
      if (!step.number) errors.push(`Step ${index}: missing number`);
      if (!step.id) errors.push(`Step ${index}: missing id`);
      if (!step.title) errors.push(`Step ${index}: missing title`);
    });

    // Check step numbers are sequential
    const numbers = flow.steps.map(s => s.number).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        errors.push(`Step numbers must be sequential starting from 1`);
        break;
      }
    }
  }

  // Validate config fields reference
  if (flow.configSections && flow.configFields) {
    const fieldIds = new Set(flow.configFields.map(f => f.id));
    flow.configSections.forEach(section => {
      section.fields.forEach(fieldId => {
        if (!fieldIds.has(fieldId)) {
          errors.push(`Section "${section.id}" references unknown field: ${fieldId}`);
        }
      });
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  loadFlow,
  loadAllFlows,
  getFlowSummaries,
  saveFlow,
  clearCache,
  getCachedFlow,
  validateFlow
};
