/**
 * ConfigManager - Shared configuration management for flow applications
 *
 * Handles loading, saving, and syncing configuration between
 * browser localStorage and server storage.
 *
 * Usage:
 *   import { ConfigManager } from './lib/flow-engine/ConfigManager.js';
 *   const config = new ConfigManager({
 *     storageKey: 'okta_device_grant_config',
 *     metaKey: 'okta_device_grant_config_meta',
 *     configType: 'device-grant-flow',
 *     fields: ['oktaDomain', 'clientId', 'scopes']
 *   });
 *   config.loadFromStorage();
 *   const cfg = config.getConfig();
 *   config.saveToStorage(cfg);
 */

import { escapeHtml } from './CurlGenerator.js';

export class ConfigManager {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.storageKey - localStorage key for config data
   * @param {string} options.metaKey - localStorage key for config metadata
   * @param {string} options.configType - Type identifier for server configs
   * @param {Array<string>} options.fields - List of config field names
   * @param {Function} options.onLoad - Callback after config is loaded
   * @param {Function} options.onSave - Callback after config is saved
   * @param {Function} options.getFieldValue - Custom getter for field values
   * @param {Function} options.setFieldValue - Custom setter for field values
   */
  constructor(options) {
    this.storageKey = options.storageKey;
    this.metaKey = options.metaKey;
    this.configType = options.configType;
    this.fields = options.fields || [];
    this.onLoad = options.onLoad || (() => {});
    this.onSave = options.onSave || (() => {});
    this.getFieldValue = options.getFieldValue || this._defaultGetFieldValue.bind(this);
    this.setFieldValue = options.setFieldValue || this._defaultSetFieldValue.bind(this);
  }

  /**
   * Default field value getter (reads from DOM element)
   * @private
   */
  _defaultGetFieldValue(field) {
    const el = document.getElementById(`cfg-${field}`);
    return el ? el.value.trim() : '';
  }

  /**
   * Default field value setter (writes to DOM element)
   * @private
   */
  _defaultSetFieldValue(field, value) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) {
      el.value = value || '';
    }
  }

  /**
   * Get current configuration from form fields
   * @returns {object} - Configuration object
   */
  getConfig() {
    const cfg = {};
    for (const field of this.fields) {
      cfg[field] = this.getFieldValue(field);
    }
    return cfg;
  }

  /**
   * Set configuration values to form fields
   * @param {object} cfg - Configuration object
   */
  setConfig(cfg) {
    for (const field of this.fields) {
      if (cfg[field] !== undefined) {
        this.setFieldValue(field, cfg[field]);
      }
    }
  }

  /**
   * Load configuration from localStorage
   * @returns {object|null} - Loaded config or null if not found
   */
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return null;

      const cfg = JSON.parse(saved);
      this.setConfig(cfg);
      this.onLoad(cfg);
      return cfg;
    } catch (e) {
      console.error('Failed to load config from storage:', e);
      return null;
    }
  }

  /**
   * Save configuration to localStorage
   * @param {object} cfg - Configuration to save (or gets current if not provided)
   * @param {string} name - Optional name for the config
   */
  saveToStorage(cfg = null, name = null) {
    cfg = cfg || this.getConfig();
    localStorage.setItem(this.storageKey, JSON.stringify(cfg));

    // Save metadata
    const meta = {
      name: name || 'Unsaved',
      source: 'browser',
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.metaKey, JSON.stringify(meta));
    this.onSave(cfg, meta);
  }

  /**
   * Clear configuration from localStorage
   */
  clearStorage() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.metaKey);
  }

  /**
   * Check if config exists in localStorage
   * @returns {boolean}
   */
  hasStoredConfig() {
    return !!localStorage.getItem(this.storageKey);
  }

  /**
   * Get config metadata from localStorage
   * @returns {object|null}
   */
  getMetadata() {
    try {
      const metaJson = localStorage.getItem(this.metaKey);
      return metaJson ? JSON.parse(metaJson) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get current user's sub claim from localStorage
   * @returns {string}
   */
  getCurrentUserSub() {
    try {
      const userJson = localStorage.getItem('okta_current_user');
      if (userJson) {
        const user = JSON.parse(userJson);
        return user.sub || 'unknown';
      }
    } catch {}
    return 'unknown';
  }

  /**
   * Get current user's display name
   * @returns {string|null}
   */
  getCurrentUserName() {
    try {
      const userJson = localStorage.getItem('okta_current_user');
      if (userJson) {
        const user = JSON.parse(userJson);
        return user.name || user.email || user.sub || null;
      }
    } catch {}
    return null;
  }

  /**
   * Save configuration to server
   * @param {string} name - Configuration name
   * @param {object} cfg - Configuration to save (or gets current if not provided)
   * @returns {Promise<object>} - Server response
   */
  async saveToServer(name, cfg = null) {
    cfg = cfg || this.getConfig();
    const creator = this.getCurrentUserSub();

    const res = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        creator,
        configurationType: this.configType,
        config: cfg,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    // Update local storage with server metadata
    localStorage.setItem(this.storageKey, JSON.stringify(cfg));
    localStorage.setItem(this.metaKey, JSON.stringify({
      name,
      source: 'server',
      serverId: data.id,
      creator,
      savedAt: new Date().toISOString(),
    }));

    this.onSave(cfg, { name, source: 'server', serverId: data.id });
    return data;
  }

  /**
   * Update existing server configuration
   * @param {string} id - Server config ID
   * @param {object} cfg - Configuration to save
   * @returns {Promise<object>} - Server response
   */
  async updateOnServer(id, cfg = null) {
    cfg = cfg || this.getConfig();

    const res = await fetch(`/api/configs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cfg }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update');
    return data;
  }

  /**
   * Load configuration from server
   * @param {string} id - Server config ID
   * @returns {Promise<object>} - Configuration data
   */
  async loadFromServer(id) {
    const res = await fetch(`/api/configs/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');

    const cfg = data.config;
    this.setConfig(cfg);

    // Save to local storage with server metadata
    localStorage.setItem(this.storageKey, JSON.stringify(cfg));
    localStorage.setItem(this.metaKey, JSON.stringify({
      name: data.name,
      source: 'server',
      serverId: id,
      creator: data.creator,
      savedAt: new Date().toISOString(),
    }));

    this.onLoad(cfg);
    return data;
  }

  /**
   * Delete configuration from server
   * @param {string} id - Server config ID
   * @returns {Promise<void>}
   */
  async deleteFromServer(id) {
    const creator = this.getCurrentUserSub();
    const res = await fetch(`/api/configs/${id}?creator=${encodeURIComponent(creator)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
  }

  /**
   * List all configurations from server for this config type
   * @returns {Promise<Array>} - List of configurations
   */
  async listFromServer() {
    const res = await fetch(`/api/configs?type=${encodeURIComponent(this.configType)}`);
    const configs = await res.json();
    return configs;
  }

  /**
   * Render server configs list as HTML
   * @param {Array} configs - List of configurations
   * @param {object} options - Render options
   * @returns {string} - HTML string
   */
  renderConfigList(configs, options = {}) {
    if (configs.length === 0) {
      return '<div class="config-list-empty">No saved configurations for this flow.</div>';
    }

    const currentUserSub = this.getCurrentUserSub();

    return configs.map((c) => {
      const date = new Date(c.updatedAt).toLocaleDateString();
      const canDelete = c.creator === currentUserSub;
      const noteHtml = c.note ? `<div class="config-item-note">${escapeHtml(c.note)}</div>` : '';

      return `
        <div class="config-item" data-config-id="${c.id}">
          <div class="config-item-info">
            <div class="config-item-name">${escapeHtml(c.name)}</div>
            <div class="config-item-meta">by ${escapeHtml(c.creator)} &middot; ${date}</div>
            ${noteHtml}
          </div>
          <div class="config-item-actions">
            <button class="btn-load" data-action="load" data-id="${c.id}">Load</button>
            ${canDelete ? `<button class="btn-delete" data-action="delete" data-id="${c.id}">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Update config status display element
   * @param {string} statusElementId - ID of status element
   */
  updateStatusDisplay(statusElementId) {
    const statusEl = document.getElementById(statusElementId);
    if (!statusEl) return;

    const hasSaved = this.hasStoredConfig();
    const meta = this.getMetadata();

    if (hasSaved && meta) {
      const name = meta.name || 'Untitled';
      if (meta.source === 'server') {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(name)}</span>`;
        statusEl.className = 'config-status saved';
      } else {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(name)}</span> <span class="config-badge-browser">browser storage</span>`;
        statusEl.className = 'config-status saved';
      }
    } else if (hasSaved) {
      statusEl.innerHTML = '<span class="config-badge-browser">browser storage</span>';
      statusEl.className = 'config-status saved';
    } else {
      statusEl.textContent = '(not saved)';
      statusEl.className = 'config-status';
    }
  }
}

/**
 * Create standalone config management functions
 * @param {object} options - Same as ConfigManager constructor
 * @returns {object} - Config management functions
 */
export function createConfigFunctions(options) {
  const manager = new ConfigManager(options);

  return {
    getConfig: () => manager.getConfig(),
    setConfig: (cfg) => manager.setConfig(cfg),
    loadFromStorage: () => manager.loadFromStorage(),
    saveToStorage: (cfg, name) => manager.saveToStorage(cfg, name),
    clearStorage: () => manager.clearStorage(),
    hasStoredConfig: () => manager.hasStoredConfig(),
    getMetadata: () => manager.getMetadata(),
    getCurrentUserSub: () => manager.getCurrentUserSub(),
    getCurrentUserName: () => manager.getCurrentUserName(),
    saveToServer: (name, cfg) => manager.saveToServer(name, cfg),
    updateOnServer: (id, cfg) => manager.updateOnServer(id, cfg),
    loadFromServer: (id) => manager.loadFromServer(id),
    deleteFromServer: (id) => manager.deleteFromServer(id),
    listFromServer: () => manager.listFromServer(),
    renderConfigList: (configs, opts) => manager.renderConfigList(configs, opts),
    updateStatusDisplay: (id) => manager.updateStatusDisplay(id),
  };
}

// Default export
export default ConfigManager;
