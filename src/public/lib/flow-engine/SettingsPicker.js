/**
 * SettingsPicker - Reusable picker component for selecting orgs, apps, and agents
 *
 * This component provides dropdown selectors for the centralized settings,
 * designed to be used by the flow builder and flow pages.
 *
 * Usage:
 *   import { SettingsPicker } from './lib/flow-engine/SettingsPicker.js';
 *   const picker = new SettingsPicker({
 *     containerId: 'settings-picker-container',
 *     showOrg: true,
 *     showApp: true,
 *     showAgent: true,
 *     showAuthServer: true,
 *     onChange: (selection) => { console.log(selection); }
 *   });
 *   await picker.init();
 */

import { escapeHtml, escapeAttr } from './CurlGenerator.js';

export class SettingsPicker {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {boolean} options.showOrg - Show organization picker (default: true)
   * @param {boolean} options.showApp - Show application picker (default: true)
   * @param {boolean} options.showAgent - Show agent picker (default: false)
   * @param {boolean} options.showAuthServer - Show auth server picker (default: true)
   * @param {Function} options.onChange - Callback when selection changes
   * @param {object} options.initialSelection - Initial selection { orgId, appId, agentId, authServerId }
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.showOrg = options.showOrg !== false;
    this.showApp = options.showApp !== false;
    this.showAgent = options.showAgent || false;
    this.showAuthServer = options.showAuthServer !== false;
    this.onChange = options.onChange || (() => {});
    this.initialSelection = options.initialSelection || {};

    // Data
    this.orgs = [];
    this.apps = [];
    this.agents = [];

    // Current selection
    this.selection = {
      orgId: null,
      appId: null,
      agentId: null,
      authServerId: null,
    };
  }

  /**
   * Initialize the picker
   */
  async init() {
    await this.loadData();
    this.render();
    this.bindEvents();

    // Apply initial selection
    if (this.initialSelection.orgId) {
      this.setOrg(this.initialSelection.orgId);
    }
    if (this.initialSelection.appId) {
      this.setApp(this.initialSelection.appId);
    }
    if (this.initialSelection.agentId) {
      this.setAgent(this.initialSelection.agentId);
    }
    if (this.initialSelection.authServerId) {
      this.setAuthServer(this.initialSelection.authServerId);
    }
  }

  /**
   * Load settings data from server
   */
  async loadData() {
    try {
      const res = await fetch('/api/settings/summary');
      const data = await res.json();
      this.orgs = data.orgs || [];
      this.apps = data.apps || [];
      this.agents = data.agents || [];
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  /**
   * Render the picker UI
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    let html = '<div class="settings-picker">';

    // Organization picker
    if (this.showOrg) {
      html += `
        <div class="picker-field">
          <label for="picker-org">Organization</label>
          <select id="picker-org">
            <option value="">Select organization...</option>
            ${this.orgs.map(o => `
              <option value="${escapeAttr(o.id)}" data-domain="${escapeAttr(o.oktaDomain)}">
                ${escapeHtml(o.name)}
              </option>
            `).join('')}
          </select>
          <div class="picker-preview" id="picker-org-preview"></div>
        </div>
      `;
    }

    // Auth server picker (depends on org selection)
    if (this.showAuthServer) {
      html += `
        <div class="picker-field" id="picker-auth-server-field">
          <label for="picker-auth-server">Authorization Server</label>
          <select id="picker-auth-server">
            <option value="">Org Auth Server (oauth2/v1)</option>
            <option value="default">Default (oauth2/default/v1)</option>
          </select>
          <div class="picker-preview" id="picker-auth-server-preview">/oauth2/v1/</div>
        </div>
      `;
    }

    // Application picker
    if (this.showApp) {
      html += `
        <div class="picker-field">
          <label for="picker-app">Application</label>
          <select id="picker-app">
            <option value="">Select application...</option>
            ${this.apps.map(a => `
              <option value="${escapeAttr(a.id)}" data-org-id="${escapeAttr(a.orgId || '')}" data-client-id="${escapeAttr(a.clientId)}">
                ${escapeHtml(a.name)} (${escapeHtml(a.clientId)})
              </option>
            `).join('')}
          </select>
          <div class="picker-preview" id="picker-app-preview"></div>
        </div>
      `;
    }

    // Agent picker
    if (this.showAgent) {
      html += `
        <div class="picker-field">
          <label for="picker-agent">Agent / Principal</label>
          <select id="picker-agent">
            <option value="">Select agent...</option>
            ${this.agents.map(a => `
              <option value="${escapeAttr(a.id)}" data-org-id="${escapeAttr(a.orgId || '')}" data-principal-id="${escapeAttr(a.principalId)}">
                ${escapeHtml(a.name)}
              </option>
            `).join('')}
          </select>
          <div class="picker-preview" id="picker-agent-preview"></div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Add styles if not already present
    if (!document.getElementById('settings-picker-styles')) {
      const style = document.createElement('style');
      style.id = 'settings-picker-styles';
      style.textContent = `
        .settings-picker {
          display: grid;
          gap: 1rem;
        }
        .picker-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .picker-field label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .picker-field select {
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 0.9rem;
        }
        .picker-preview {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-family: monospace;
          padding: 0.25rem 0;
        }
        .picker-preview:empty {
          display: none;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    const orgSelect = document.getElementById('picker-org');
    const appSelect = document.getElementById('picker-app');
    const agentSelect = document.getElementById('picker-agent');
    const authServerSelect = document.getElementById('picker-auth-server');

    if (orgSelect) {
      orgSelect.addEventListener('change', () => this._handleOrgChange());
    }

    if (appSelect) {
      appSelect.addEventListener('change', () => this._handleAppChange());
    }

    if (agentSelect) {
      agentSelect.addEventListener('change', () => this._handleAgentChange());
    }

    if (authServerSelect) {
      authServerSelect.addEventListener('change', () => this._handleAuthServerChange());
    }
  }

  /**
   * Handle org selection change
   * @private
   */
  _handleOrgChange() {
    const select = document.getElementById('picker-org');
    const preview = document.getElementById('picker-org-preview');
    const authServerSelect = document.getElementById('picker-auth-server');

    this.selection.orgId = select.value || null;

    // Update preview
    if (this.selection.orgId) {
      const option = select.selectedOptions[0];
      preview.textContent = option.dataset.domain;
    } else {
      preview.textContent = '';
    }

    // Update auth server options
    if (authServerSelect && this.selection.orgId) {
      const org = this.orgs.find(o => o.id === this.selection.orgId);
      const customServers = org?.authServers || [];

      // Rebuild options
      authServerSelect.innerHTML = `
        <option value="">Org Auth Server (oauth2/v1)</option>
        <option value="default">Default (oauth2/default/v1)</option>
        ${customServers.map(s => `
          <option value="${escapeAttr(s.id)}">
            ${escapeHtml(s.name)} (oauth2/${escapeHtml(s.id)}/v1)
          </option>
        `).join('')}
      `;
    }

    // Filter apps/agents by org
    this._filterByOrg();

    this._updateAuthServerPreview();
    this._notifyChange();
  }

  /**
   * Handle app selection change
   * @private
   */
  _handleAppChange() {
    const select = document.getElementById('picker-app');
    const preview = document.getElementById('picker-app-preview');

    this.selection.appId = select.value || null;

    // Update preview
    if (this.selection.appId) {
      const option = select.selectedOptions[0];
      preview.textContent = `Client ID: ${option.dataset.clientId}`;

      // If org not selected, auto-select from app
      if (!this.selection.orgId && option.dataset.orgId) {
        const orgSelect = document.getElementById('picker-org');
        if (orgSelect) {
          orgSelect.value = option.dataset.orgId;
          this._handleOrgChange();
        }
      }
    } else {
      preview.textContent = '';
    }

    this._notifyChange();
  }

  /**
   * Handle agent selection change
   * @private
   */
  _handleAgentChange() {
    const select = document.getElementById('picker-agent');
    const preview = document.getElementById('picker-agent-preview');

    this.selection.agentId = select.value || null;

    // Update preview
    if (this.selection.agentId) {
      const option = select.selectedOptions[0];
      preview.textContent = `Principal: ${option.dataset.principalId}`;
    } else {
      preview.textContent = '';
    }

    this._notifyChange();
  }

  /**
   * Handle auth server selection change
   * @private
   */
  _handleAuthServerChange() {
    const select = document.getElementById('picker-auth-server');
    this.selection.authServerId = select.value || null;

    this._updateAuthServerPreview();
    this._notifyChange();
  }

  /**
   * Update auth server preview
   * @private
   */
  _updateAuthServerPreview() {
    const preview = document.getElementById('picker-auth-server-preview');
    if (!preview) return;

    if (this.selection.authServerId) {
      preview.textContent = `/oauth2/${this.selection.authServerId}/v1/`;
    } else {
      preview.textContent = '/oauth2/v1/';
    }
  }

  /**
   * Filter apps and agents by selected org
   * @private
   */
  _filterByOrg() {
    const appSelect = document.getElementById('picker-app');
    const agentSelect = document.getElementById('picker-agent');

    if (appSelect) {
      const options = appSelect.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return; // Skip placeholder
        const appOrgId = opt.dataset.orgId;
        if (this.selection.orgId && appOrgId && appOrgId !== this.selection.orgId) {
          opt.hidden = true;
          if (opt.selected) {
            appSelect.value = '';
            this._handleAppChange();
          }
        } else {
          opt.hidden = false;
        }
      });
    }

    if (agentSelect) {
      const options = agentSelect.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return;
        const agentOrgId = opt.dataset.orgId;
        if (this.selection.orgId && agentOrgId && agentOrgId !== this.selection.orgId) {
          opt.hidden = true;
          if (opt.selected) {
            agentSelect.value = '';
            this._handleAgentChange();
          }
        } else {
          opt.hidden = false;
        }
      });
    }
  }

  /**
   * Notify change callback
   * @private
   */
  _notifyChange() {
    this.onChange(this.getSelection());
  }

  /**
   * Get current selection
   * @returns {object} - { orgId, appId, agentId, authServerId, resolved }
   */
  getSelection() {
    return { ...this.selection };
  }

  /**
   * Get resolved configuration (with actual values)
   * @returns {Promise<object>}
   */
  async getResolvedConfig() {
    try {
      const res = await fetch('/api/settings/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.selection),
      });
      return await res.json();
    } catch (err) {
      console.error('Failed to resolve config:', err);
      return null;
    }
  }

  /**
   * Set organization
   * @param {string} orgId
   */
  setOrg(orgId) {
    const select = document.getElementById('picker-org');
    if (select) {
      select.value = orgId;
      this._handleOrgChange();
    }
  }

  /**
   * Set application
   * @param {string} appId
   */
  setApp(appId) {
    const select = document.getElementById('picker-app');
    if (select) {
      select.value = appId;
      this._handleAppChange();
    }
  }

  /**
   * Set agent
   * @param {string} agentId
   */
  setAgent(agentId) {
    const select = document.getElementById('picker-agent');
    if (select) {
      select.value = agentId;
      this._handleAgentChange();
    }
  }

  /**
   * Set auth server
   * @param {string} authServerId
   */
  setAuthServer(authServerId) {
    const select = document.getElementById('picker-auth-server');
    if (select) {
      select.value = authServerId;
      this._handleAuthServerChange();
    }
  }

  /**
   * Refresh data from server
   */
  async refresh() {
    const currentSelection = this.getSelection();
    await this.loadData();
    this.render();
    this.bindEvents();

    // Restore selection
    if (currentSelection.orgId) this.setOrg(currentSelection.orgId);
    if (currentSelection.appId) this.setApp(currentSelection.appId);
    if (currentSelection.agentId) this.setAgent(currentSelection.agentId);
    if (currentSelection.authServerId) this.setAuthServer(currentSelection.authServerId);
  }
}

/**
 * Create a simple inline picker for quick selection
 * @param {object} options - Same as SettingsPicker constructor
 * @returns {Promise<SettingsPicker>}
 */
export async function createSettingsPicker(options) {
  const picker = new SettingsPicker(options);
  await picker.init();
  return picker;
}

export default SettingsPicker;
