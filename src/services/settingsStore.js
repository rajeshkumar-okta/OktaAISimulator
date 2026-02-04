/**
 * Settings Store - Centralized management for Okta orgs, apps, and agents
 *
 * Provides CRUD operations for:
 * - Organizations: Okta tenant configurations
 * - Applications: OAuth client configurations
 * - Agents: Workload/agent principal configurations (for agentic flows)
 *
 * Data is stored in data/settings/ as JSON files.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_DIR = path.resolve(__dirname, '../../data/settings');

// Ensure settings directory exists
async function ensureSettingsDir() {
  try {
    await fs.mkdir(SETTINGS_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// File paths for each entity type
const getFilePath = (type) => path.join(SETTINGS_DIR, `${type}.json`);

// Generate a unique ID
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// ============== Generic CRUD ==============

async function loadEntities(type) {
  await ensureSettingsDir();
  const filePath = getFilePath(type);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function saveEntities(type, entities) {
  await ensureSettingsDir();
  const filePath = getFilePath(type);
  await fs.writeFile(filePath, JSON.stringify(entities, null, 2), 'utf-8');
}

async function getEntity(type, id) {
  const entities = await loadEntities(type);
  return entities.find(e => e.id === id) || null;
}

async function createEntity(type, data) {
  const entities = await loadEntities(type);

  const entity = {
    id: generateId(),
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  entities.push(entity);
  await saveEntities(type, entities);
  return entity;
}

async function updateEntity(type, id, updates) {
  const entities = await loadEntities(type);
  const index = entities.findIndex(e => e.id === id);

  if (index === -1) {
    throw new Error(`${type} not found: ${id}`);
  }

  entities[index] = {
    ...entities[index],
    ...updates,
    id, // Preserve ID
    createdAt: entities[index].createdAt, // Preserve creation time
    updatedAt: new Date().toISOString(),
  };

  await saveEntities(type, entities);
  return entities[index];
}

async function deleteEntity(type, id) {
  const entities = await loadEntities(type);
  const filtered = entities.filter(e => e.id !== id);

  if (filtered.length === entities.length) {
    throw new Error(`${type} not found: ${id}`);
  }

  await saveEntities(type, filtered);
}

// ============== Organizations ==============

/**
 * Organization schema:
 * {
 *   id: string,
 *   name: string,              // Friendly name (e.g., "Production", "Dev Sandbox")
 *   oktaDomain: string,        // https://your-org.okta.com
 *   authServers: [{            // Custom authorization servers
 *     id: string,              // Auth server ID (e.g., "default", "my-api")
 *     name: string,            // Friendly name
 *     audience: string,        // Optional audience
 *   }],
 *   notes: string,
 *   createdAt: string,
 *   updatedAt: string,
 * }
 */

export async function listOrgs() {
  return loadEntities('orgs');
}

export async function getOrg(id) {
  return getEntity('orgs', id);
}

export async function createOrg(data) {
  // Normalize domain
  let domain = data.oktaDomain?.trim() || '';
  if (domain && !domain.startsWith('http')) {
    domain = 'https://' + domain;
  }
  domain = domain.replace(/\/+$/, '');

  return createEntity('orgs', {
    name: data.name?.trim() || 'Unnamed Org',
    oktaDomain: domain,
    authServers: data.authServers || [],
    notes: data.notes?.trim() || '',
  });
}

export async function updateOrg(id, updates) {
  // Normalize domain if provided
  if (updates.oktaDomain) {
    let domain = updates.oktaDomain.trim();
    if (domain && !domain.startsWith('http')) {
      domain = 'https://' + domain;
    }
    updates.oktaDomain = domain.replace(/\/+$/, '');
  }

  return updateEntity('orgs', id, updates);
}

export async function deleteOrg(id) {
  // Check for dependent apps and agents
  const apps = await listApps();
  const dependentApps = apps.filter(a => a.orgId === id);
  if (dependentApps.length > 0) {
    throw new Error(`Cannot delete org: ${dependentApps.length} application(s) depend on it`);
  }

  const agents = await listAgents();
  const dependentAgents = agents.filter(a => a.orgId === id);
  if (dependentAgents.length > 0) {
    throw new Error(`Cannot delete org: ${dependentAgents.length} agent(s) depend on it`);
  }

  return deleteEntity('orgs', id);
}

// ============== Applications ==============

/**
 * Application schema:
 * {
 *   id: string,
 *   name: string,              // Friendly name
 *   orgId: string,             // Reference to organization
 *   clientId: string,          // OAuth client ID
 *   clientSecret: string,      // OAuth client secret (optional)
 *   authMethod: string,        // 'secret' | 'private_key_jwt' | 'none'
 *   privateJwk: object,        // Private JWK for private_key_jwt (optional)
 *   redirectUris: string[],    // Redirect URIs
 *   defaultScopes: string,     // Default scopes (space-separated)
 *   applicationType: string,   // 'web' | 'spa' | 'native' | 'service'
 *   notes: string,
 *   createdAt: string,
 *   updatedAt: string,
 * }
 */

export async function listApps(orgId = null) {
  const apps = await loadEntities('apps');
  if (orgId) {
    return apps.filter(a => a.orgId === orgId);
  }
  return apps;
}

export async function getApp(id) {
  return getEntity('apps', id);
}

export async function createApp(data) {
  // Validate org exists
  if (data.orgId) {
    const org = await getOrg(data.orgId);
    if (!org) {
      throw new Error(`Organization not found: ${data.orgId}`);
    }
  }

  return createEntity('apps', {
    name: data.name?.trim() || 'Unnamed App',
    orgId: data.orgId || null,
    clientId: data.clientId?.trim() || '',
    clientSecret: data.clientSecret?.trim() || '',
    authMethod: data.authMethod || 'secret',
    privateJwk: data.privateJwk || null,
    redirectUris: data.redirectUris || [],
    defaultScopes: data.defaultScopes?.trim() || 'openid profile email',
    applicationType: data.applicationType || 'web',
    notes: data.notes?.trim() || '',
  });
}

export async function updateApp(id, updates) {
  // Validate org exists if changing
  if (updates.orgId) {
    const org = await getOrg(updates.orgId);
    if (!org) {
      throw new Error(`Organization not found: ${updates.orgId}`);
    }
  }

  return updateEntity('apps', id, updates);
}

export async function deleteApp(id) {
  return deleteEntity('apps', id);
}

// ============== Agents (Workload Identities) ==============

/**
 * Agent schema:
 * {
 *   id: string,
 *   name: string,              // Friendly name
 *   orgId: string,             // Reference to organization
 *   principalId: string,       // Workload principal ID
 *   privateJwk: object,        // Private JWK for signing
 *   notes: string,
 *   createdAt: string,
 *   updatedAt: string,
 * }
 */

export async function listAgents(orgId = null) {
  const agents = await loadEntities('agents');
  if (orgId) {
    return agents.filter(a => a.orgId === orgId);
  }
  return agents;
}

export async function getAgent(id) {
  return getEntity('agents', id);
}

export async function createAgent(data) {
  // Validate org exists
  if (data.orgId) {
    const org = await getOrg(data.orgId);
    if (!org) {
      throw new Error(`Organization not found: ${data.orgId}`);
    }
  }

  return createEntity('agents', {
    name: data.name?.trim() || 'Unnamed Agent',
    orgId: data.orgId || null,
    principalId: data.principalId?.trim() || '',
    privateJwk: data.privateJwk || null,
    notes: data.notes?.trim() || '',
  });
}

export async function updateAgent(id, updates) {
  // Validate org exists if changing
  if (updates.orgId) {
    const org = await getOrg(updates.orgId);
    if (!org) {
      throw new Error(`Organization not found: ${updates.orgId}`);
    }
  }

  return updateEntity('agents', id, updates);
}

export async function deleteAgent(id) {
  return deleteEntity('agents', id);
}

// ============== Composite Helpers ==============

/**
 * Get an app with its org details resolved
 */
export async function getAppWithOrg(appId) {
  const app = await getApp(appId);
  if (!app) return null;

  if (app.orgId) {
    const org = await getOrg(app.orgId);
    return { ...app, org };
  }

  return { ...app, org: null };
}

/**
 * Get full configuration for a flow by combining org, app, and optional agent
 */
export async function resolveFlowConfig({ orgId, appId, agentId, authServerId }) {
  const result = {
    oktaDomain: '',
    authorizationServerId: authServerId || '',
    clientId: '',
    clientSecret: '',
    authMethod: 'secret',
    privateJwk: null,
    redirectUris: [],
    defaultScopes: '',
    principalId: '',
    agentPrivateJwk: null,
  };

  // Resolve org
  if (orgId) {
    const org = await getOrg(orgId);
    if (org) {
      result.oktaDomain = org.oktaDomain;
      // Find auth server if specified by name
      if (authServerId && org.authServers) {
        const server = org.authServers.find(s => s.id === authServerId || s.name === authServerId);
        if (server) {
          result.authorizationServerId = server.id;
        }
      }
    }
  }

  // Resolve app
  if (appId) {
    const app = await getApp(appId);
    if (app) {
      result.clientId = app.clientId;
      result.clientSecret = app.clientSecret;
      result.authMethod = app.authMethod;
      result.privateJwk = app.privateJwk;
      result.redirectUris = app.redirectUris;
      result.defaultScopes = app.defaultScopes;

      // If app has an org and we didn't specify one, use the app's org
      if (!orgId && app.orgId) {
        const org = await getOrg(app.orgId);
        if (org) {
          result.oktaDomain = org.oktaDomain;
        }
      }
    }
  }

  // Resolve agent
  if (agentId) {
    const agent = await getAgent(agentId);
    if (agent) {
      result.principalId = agent.principalId;
      result.agentPrivateJwk = agent.privateJwk;
    }
  }

  return result;
}

/**
 * Get all settings for export/backup
 */
export async function exportAllSettings() {
  const [orgs, apps, agents] = await Promise.all([
    listOrgs(),
    listApps(),
    listAgents(),
  ]);

  return { orgs, apps, agents };
}

/**
 * Import settings from backup (merges with existing)
 */
export async function importSettings({ orgs = [], apps = [], agents = [] }, overwrite = false) {
  if (overwrite) {
    await saveEntities('orgs', orgs);
    await saveEntities('apps', apps);
    await saveEntities('agents', agents);
  } else {
    // Merge - add new items, skip existing IDs
    const existingOrgs = await listOrgs();
    const existingApps = await listApps();
    const existingAgents = await listAgents();

    const existingOrgIds = new Set(existingOrgs.map(o => o.id));
    const existingAppIds = new Set(existingApps.map(a => a.id));
    const existingAgentIds = new Set(existingAgents.map(a => a.id));

    const newOrgs = orgs.filter(o => !existingOrgIds.has(o.id));
    const newApps = apps.filter(a => !existingAppIds.has(a.id));
    const newAgents = agents.filter(a => !existingAgentIds.has(a.id));

    await saveEntities('orgs', [...existingOrgs, ...newOrgs]);
    await saveEntities('apps', [...existingApps, ...newApps]);
    await saveEntities('agents', [...existingAgents, ...newAgents]);

    return {
      imported: {
        orgs: newOrgs.length,
        apps: newApps.length,
        agents: newAgents.length,
      },
      skipped: {
        orgs: orgs.length - newOrgs.length,
        apps: apps.length - newApps.length,
        agents: agents.length - newAgents.length,
      },
    };
  }
}

export default {
  // Orgs
  listOrgs,
  getOrg,
  createOrg,
  updateOrg,
  deleteOrg,
  // Apps
  listApps,
  getApp,
  createApp,
  updateApp,
  deleteApp,
  getAppWithOrg,
  // Agents
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  // Helpers
  resolveFlowConfig,
  exportAllSettings,
  importSettings,
};
