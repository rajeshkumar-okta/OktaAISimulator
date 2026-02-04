/**
 * FlowEngine - Runtime engine for JSON-driven OAuth flows
 *
 * This is the main orchestrator that:
 * - Loads flow definitions
 * - Initializes components (ConfigManager, StepController, etc.)
 * - Binds event handlers
 * - Executes step actions
 * - Manages flow state
 *
 * Usage:
 *   import { FlowEngine } from './lib/flow-engine/FlowEngine.js';
 *   const engine = new FlowEngine('device-grant-flow');
 *   await engine.init();
 */

import { FlowRenderer, renderFlow } from './FlowRenderer.js';
import { DialogManager } from './DialogManager.js';
import { ConfigManager } from './ConfigManager.js';
import { StepController } from './StepController.js';
import { ScopeSelector } from './ScopeSelector.js';
import { AuthServerPicker, setupOktaDomainAutoCorrect } from './AuthServerPicker.js';
import { TokenDisplay, createTokenTabs, buildTokenCopyButtons } from './TokenDisplay.js';
import { showActualCurl, formatCurl, escapeHtml, interpolateCurlTemplate } from './CurlGenerator.js';
import { ExpressionAutocomplete } from './ExpressionAutocomplete.js';

export class FlowEngine {
  /**
   * @param {string|object} flowIdOrDefinition - Flow ID to load or flow definition object
   * @param {object} options - Engine options
   * @param {string} options.containerId - Container element ID (default: 'flow-container')
   * @param {object} options.customHandlers - Map of custom handler functions
   */
  constructor(flowIdOrDefinition, options = {}) {
    this.flowId = typeof flowIdOrDefinition === 'string' ? flowIdOrDefinition : null;
    this.flow = typeof flowIdOrDefinition === 'object' ? flowIdOrDefinition : null;
    this.containerId = options.containerId || 'flow-container';
    this.customHandlers = options.customHandlers || {};

    // Components (initialized in init())
    this.dialog = null;
    this.config = null;
    this.steps = null;
    this.scopeSelector = null;
    this.authServerPicker = null;
    this.tokenDisplay = null;
    this.renderer = null;
    this.expressionAutocomplete = null;

    // Flow state
    this.state = {};
    this.tokens = {};
    this.pollingTimer = null;
    this.pollCount = 0;

    // Edit mode state
    this.editMode = false;
    this.editingStep = null;
  }

  /**
   * Initialize the flow engine
   */
  async init() {
    // Load flow definition if needed
    if (!this.flow && this.flowId) {
      // Use reload=true to bypass server cache and get fresh definition
      const res = await fetch(`/api/flows/${this.flowId}?reload=true`);
      if (!res.ok) {
        throw new Error(`Failed to load flow: ${this.flowId}`);
      }
      this.flow = await res.json();
    }

    if (!this.flow) {
      throw new Error('No flow definition provided');
    }

    // Initialize state from schema
    this._initializeState();

    // Render the flow UI
    this.renderer = renderFlow(this.flow, this.containerId);

    // Initialize components
    this._initializeComponents();

    // Bind event handlers
    this._bindEventHandlers();

    // Load config from storage
    this.config.loadFromStorage();

    // Update cURL commands
    this.updateCurlCommands();
  }

  /**
   * Initialize state from flow's state schema
   * @private
   */
  _initializeState() {
    const { stateSchema } = this.flow;
    if (!stateSchema) return;

    for (const [key, schema] of Object.entries(stateSchema)) {
      this.state[key] = schema.default ?? null;
    }
  }

  /**
   * Initialize all components
   * @private
   */
  _initializeComponents() {
    // Dialog manager
    this.dialog = new DialogManager('dialog-modal');

    // Config manager
    const configFields = this.flow.configFields?.map(f => f.id) || [];
    this.config = new ConfigManager({
      storageKey: this.flow.storageKey || `okta_${this.flow.configType}_config`,
      metaKey: this.flow.storageMetaKey || `okta_${this.flow.configType}_config_meta`,
      configType: this.flow.configType,
      fields: configFields,
      onLoad: () => {
        this.updateCurlCommands();
        this.scopeSelector?.debouncedFetch();
      },
      onSave: () => {
        this.config.updateStatusDisplay('config-status');
      },
    });

    // Step controller
    this.steps = new StepController({
      totalSteps: this.flow.steps?.length || 0,
    });

    // Auth server picker (if flow uses it)
    if (this._hasFieldType('auth-server-picker')) {
      this.authServerPicker = new AuthServerPicker({
        modeSelectId: 'cfg-authServerMode',
        customInputId: 'cfg-authorizationServerId',
        previewId: 'auth-server-preview',
        onChange: () => {
          this.updateCurlCommands();
          this.scopeSelector?.debouncedFetch();
        },
      });
      this.authServerPicker.init();
    }

    // Scope selector (if flow uses it)
    if (this._hasFieldType('scope-selector')) {
      this.scopeSelector = new ScopeSelector({
        tilesContainerId: 'scope-tiles',
        loadingElementId: 'scope-loading',
        customInputId: 'scope-custom-input',
        addButtonId: 'scope-add-btn',
        hiddenInputId: 'cfg-scopes',
        getOktaDomain: () => document.getElementById('cfg-oktaDomain')?.value?.trim() || '',
        getAuthServerId: () => this.authServerPicker?.getAuthServerId() || '',
        onChange: () => this.updateCurlCommands(),
      });
      this.scopeSelector.init();
    }

    // Token display
    this.tokenDisplay = new TokenDisplay(this.tokens);

    // Expression autocomplete for step editor
    this.expressionAutocomplete = new ExpressionAutocomplete(this.flow);
    this.expressionAutocomplete.attachToStepEditModal();

    // Okta domain auto-correct
    setupOktaDomainAutoCorrect('cfg-oktaDomain', () => {
      this.updateCurlCommands();
      this.scopeSelector?.debouncedFetch();
      this._updateDomainLink();
    });

    // Set up domain link updater
    this._updateDomainLink();
    document.getElementById('cfg-oktaDomain')?.addEventListener('input', () => this._updateDomainLink());

    // Update status display
    this.config.updateStatusDisplay('config-status');
  }

  /**
   * Check if flow has a specific field type
   * @private
   */
  _hasFieldType(type) {
    return this.flow.configFields?.some(f => f.type === type);
  }

  /**
   * Update inline device code displays
   * @private
   */
  _updateDeviceCodeDisplays() {
    this.flow.steps?.forEach(step => {
      if (!step.deviceCodeDisplay) return;

      const display = document.getElementById(`device-code-display-${step.number}`);
      if (!display) return;

      // Get values from state
      const userCode = this._evaluateExpression(step.deviceCodeDisplay.userCodeSource);
      const verificationUri = this._evaluateExpression(step.deviceCodeDisplay.verificationUriSource);
      const verificationUriComplete = this._evaluateExpression(step.deviceCodeDisplay.verificationUriCompleteSource);

      // Only show if we have the user code
      if (userCode) {
        display.hidden = false;

        // Update user code
        const userCodeEl = document.getElementById(`user-code-${step.number}`);
        if (userCodeEl) userCodeEl.textContent = userCode;

        // Update verification URI
        const linkEl = document.getElementById(`verification-uri-${step.number}`);
        if (linkEl) {
          linkEl.href = verificationUriComplete || verificationUri || '#';
          linkEl.textContent = verificationUri || '-';
        }
      }
    });
  }

  /**
   * Update the Okta domain link visibility and href
   * @private
   */
  _updateDomainLink() {
    const domainInput = document.getElementById('cfg-oktaDomain');
    const domainLink = document.getElementById('okta-domain-link');
    if (!domainLink) return;

    const domain = domainInput?.value?.trim();
    if (domain) {
      // Ensure the domain has https:// prefix
      let url = domain;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      // Link to admin console
      domainLink.href = url + '/admin';
      domainLink.hidden = false;
    } else {
      domainLink.hidden = true;
    }
  }

  /**
   * Bind event handlers
   * @private
   */
  _bindEventHandlers() {
    // Config actions
    document.getElementById('save-config-btn')?.addEventListener('click', () => this._handleSaveConfig());
    document.getElementById('save-server-btn')?.addEventListener('click', () => this._handleSaveToServer());
    document.getElementById('clear-config-btn')?.addEventListener('click', () => this._handleClearConfig());
    document.getElementById('load-saved-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleLoadConfigs();
    });

    // Modal close
    document.getElementById('close-modal-btn')?.addEventListener('click', () => {
      document.getElementById('configs-modal').hidden = true;
    });
    document.getElementById('configs-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'configs-modal') {
        e.target.hidden = true;
      }
    });

    // Flow controls
    document.getElementById('reset-btn')?.addEventListener('click', () => this._handleReset());
    document.getElementById('view-logs-btn')?.addEventListener('click', () => {
      window.open('/log-viewer.html', '_blank');
    });

    // Edit mode toggle
    document.getElementById('edit-mode-toggle')?.addEventListener('change', (e) => this._setEditMode(e.target.checked));

    // Export flow
    document.getElementById('export-flow-btn')?.addEventListener('click', () => this._exportFlow());

    // Flow state selector
    document.getElementById('flow-state-select')?.addEventListener('change', async (e) => {
      this.flow.state = e.target.value;
      await this._saveFlowToServer();
    });

    // Step edit buttons
    document.querySelectorAll('.step-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this._openStepEdit(parseInt(btn.dataset.step, 10)));
    });

    // Step move buttons
    document.querySelectorAll('.step-move-btn').forEach(btn => {
      btn.addEventListener('click', () => this._moveStep(parseInt(btn.dataset.step, 10), btn.dataset.direction));
    });

    // Step edit modal
    document.getElementById('close-step-edit-btn')?.addEventListener('click', () => this._closeStepEdit());
    document.getElementById('step-edit-cancel')?.addEventListener('click', () => this._closeStepEdit());
    document.getElementById('step-edit-save')?.addEventListener('click', () => this._saveStepEdit());
    document.getElementById('step-edit-delete')?.addEventListener('click', () => this._deleteStep());
    document.getElementById('step-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'step-edit-modal') this._closeStepEdit();
    });

    // Step edit tabs
    document.querySelectorAll('.step-edit-tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchEditTab(tab.dataset.tab));
    });

    // Add step buttons
    document.querySelectorAll('.add-step-btn').forEach(btn => {
      btn.addEventListener('click', () => this._addStepAfter(parseInt(btn.dataset.after, 10)));
    });

    // Editable list add buttons
    document.getElementById('step-edit-add-endpoint')?.addEventListener('click', () => this._addEditableItem('endpoints'));
    document.getElementById('step-edit-add-curl-header')?.addEventListener('click', () => this._addEditableItem('curl-headers'));
    document.getElementById('step-edit-add-curl-body')?.addEventListener('click', () => this._addEditableItem('curl-body'));
    document.getElementById('step-edit-add-api-result')?.addEventListener('click', () => this._addEditableItem('api-results'));
    document.getElementById('step-edit-add-poll-result')?.addEventListener('click', () => this._addEditableItem('poll-results'));

    // Sub functions add button
    document.getElementById('step-edit-add-subfn')?.addEventListener('click', () => this._addSubFunction());

    // Step buttons
    this.flow.steps?.forEach(step => {
      const btn = document.getElementById(`btn-step-${step.number}`);
      if (btn) {
        btn.addEventListener('click', () => this._handleStepAction(step));
      }

      // Stop button for polling
      if (step.stopButton) {
        const stopBtn = document.getElementById(step.stopButton.id);
        if (stopBtn) {
          stopBtn.addEventListener('click', () => this._stopPolling());
        }
      }
    });

    // Token tabs
    if (this.flow.tokenDisplay?.tabs) {
      document.querySelectorAll('.token-tab').forEach(tab => {
        tab.addEventListener('click', () => this._switchTokenTab(tab.dataset.tab));
      });
    }

    // Config input changes
    this.flow.configFields?.forEach(field => {
      const el = document.getElementById(`cfg-${field.id}`);
      if (el) {
        el.addEventListener('input', () => this.updateCurlCommands());
        el.addEventListener('change', () => this.updateCurlCommands());
      }
    });
  }

  /**
   * Handle save config to browser
   * @private
   */
  async _handleSaveConfig() {
    const name = await this.dialog.prompt('Enter a name for this configuration:', '', 'Save to Browser');
    if (name === null) return;
    this.config.saveToStorage(null, name || 'Untitled');
    await this.dialog.alert(`Configuration saved to browser as "${name || 'Untitled'}"`, 'Saved');
  }

  /**
   * Handle save config to server
   * @private
   */
  async _handleSaveToServer() {
    const name = await this.dialog.prompt('Configuration name:', '', 'Save to Server');
    if (!name) return;

    try {
      await this.config.saveToServer(name);
      await this.dialog.alert(`Configuration saved as "${name}"`, 'Saved');
    } catch (err) {
      await this.dialog.alert(`Error saving: ${err.message}`, 'Error');
    }
  }

  /**
   * Handle clear config
   * @private
   */
  async _handleClearConfig() {
    this.config.clearStorage();
    // Clear form fields
    this.flow.configFields?.forEach(field => {
      const el = document.getElementById(`cfg-${field.id}`);
      if (el) el.value = field.default || '';
    });
    this.scopeSelector?.clear();
    this.config.updateStatusDisplay('config-status');
    this.updateCurlCommands();
    await this.dialog.alert('Configuration cleared.', 'Cleared');
  }

  /**
   * Handle load configs modal
   * @private
   */
  async _handleLoadConfigs() {
    const modal = document.getElementById('configs-modal');
    const listEl = document.getElementById('configs-list');
    modal.hidden = false;
    listEl.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const configs = await this.config.listFromServer();
      listEl.innerHTML = this.config.renderConfigList(configs);

      // Bind load/delete buttons
      listEl.querySelectorAll('[data-action="load"]').forEach(btn => {
        btn.addEventListener('click', () => this._loadServerConfig(btn.dataset.id));
      });
      listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => this._deleteServerConfig(btn.dataset.id));
      });
    } catch (err) {
      listEl.innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
    }
  }

  /**
   * Load a server config
   * @private
   */
  async _loadServerConfig(id) {
    try {
      await this.config.loadFromServer(id);
      document.getElementById('configs-modal').hidden = true;
      this.updateCurlCommands();
      this.scopeSelector?.debouncedFetch();
    } catch (err) {
      await this.dialog.alert(`Error loading: ${err.message}`, 'Error');
    }
  }

  /**
   * Delete a server config
   * @private
   */
  async _deleteServerConfig(id) {
    const confirmed = await this.dialog.confirm('Delete this configuration?', 'Delete');
    if (!confirmed) return;

    try {
      await this.config.deleteFromServer(id);
      this._handleLoadConfigs(); // Refresh list
    } catch (err) {
      await this.dialog.alert(`Error deleting: ${err.message}`, 'Error');
    }
  }

  /**
   * Handle reset
   * @private
   */
  async _handleReset() {
    this._stopPolling();
    this._initializeState();
    this.tokens = {};
    this.steps.resetAll(1);

    // Reset custom displays
    const deviceCodeDisplay = document.getElementById('device-code-display');
    if (deviceCodeDisplay) deviceCodeDisplay.hidden = true;

    const tokenDetails = document.getElementById('token-details');
    if (tokenDetails) tokenDetails.hidden = true;

    // Clear curl-actual classes
    document.querySelectorAll('.curl-actual').forEach(el => el.classList.remove('curl-actual'));

    this.updateCurlCommands();

    // Reset on server
    try {
      await fetch('/api/steps/reset', { method: 'POST' });
    } catch (e) {
      console.error('Reset failed:', e);
    }
  }

  /**
   * Toggle edit mode
   * @private
   */
  _toggleEditMode() {
    this._setEditMode(!this.editMode);
  }

  /**
   * Set edit mode on or off
   * @private
   */
  _setEditMode(enabled) {
    this.editMode = enabled;
    const toggle = document.getElementById('edit-mode-toggle');
    const exportBtn = document.getElementById('export-flow-btn');

    // Sync toggle state
    if (toggle) toggle.checked = enabled;

    const stateSelector = document.getElementById('flow-state-selector');

    if (this.editMode) {
      if (exportBtn) exportBtn.hidden = false;
      if (stateSelector) stateSelector.hidden = false;
      document.querySelectorAll('.step-edit-controls').forEach(c => c.hidden = false);
      document.querySelectorAll('.step').forEach(s => s.classList.add('edit-mode'));
      document.querySelectorAll('.add-step-container').forEach(c => c.hidden = false);
      this._updateMoveButtons();
    } else {
      if (exportBtn) exportBtn.hidden = true;
      if (stateSelector) stateSelector.hidden = true;
      document.querySelectorAll('.step-edit-controls').forEach(c => c.hidden = true);
      document.querySelectorAll('.step').forEach(s => s.classList.remove('edit-mode'));
      document.querySelectorAll('.add-step-container').forEach(c => c.hidden = true);
    }
  }

  /**
   * Export the flow definition as JSON
   * @private
   */
  _exportFlow() {
    const flowJson = JSON.stringify(this.flow, null, 2);
    const blob = new Blob([flowJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.flow.id || 'flow'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Save the flow definition to the server
   * @private
   * @returns {Promise<boolean>} - true if save was successful
   */
  async _saveFlowToServer() {
    if (!this.flow?.id) {
      console.error('Cannot save flow: no flow ID');
      return false;
    }

    try {
      const res = await fetch(`/api/flows/${this.flow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.flow),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Failed to save flow:', data.error);
        await this.dialog.alert(`Failed to save: ${data.error}`, 'Save Error');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error saving flow:', err);
      await this.dialog.alert(`Error saving flow: ${err.message}`, 'Save Error');
      return false;
    }
  }

  /**
   * Switch edit modal tab
   * @private
   */
  _switchEditTab(tabId) {
    document.querySelectorAll('.step-edit-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.step-edit-panel').forEach(p => {
      p.classList.toggle('active', p.id === `step-edit-panel-${tabId}`);
    });
  }

  /**
   * Open step edit modal
   * @private
   */
  _openStepEdit(stepNumber) {
    const step = this.flow.steps?.find(s => s.number === stepNumber);
    if (!step) return;

    this.editingStep = stepNumber;

    // Reset to first tab
    this._switchEditTab('basic');

    // Populate Basic tab
    document.getElementById('step-edit-number').textContent = stepNumber;
    document.getElementById('step-edit-id').value = step.id || '';
    document.getElementById('step-edit-title').value = step.title || '';
    document.getElementById('step-edit-description').value = step.description || '';
    document.getElementById('step-edit-actor').value = step.actor || '';
    document.getElementById('step-edit-actor-label').value = step.actorLabel || '';
    document.getElementById('step-edit-actor-icon').value = step.actorIcon || '';
    document.getElementById('step-edit-info').value = step.info || '';
    document.getElementById('step-edit-locked').checked = !!step.initiallyLocked;

    // Populate Button tab
    document.getElementById('step-edit-button-visible').checked = !step.button?.hidden;
    document.getElementById('step-edit-button-show-as-qr').checked = !!step.button?.showAsQR;
    document.getElementById('step-edit-button-label').value = step.button?.label || '';
    document.getElementById('step-edit-button-action').value = step.button?.action || '';
    document.getElementById('step-edit-button-url-source').value = step.button?.urlSource || '';
    document.getElementById('step-edit-stop-label').value = step.stopButton?.label || '';
    document.getElementById('step-edit-stop-id').value = step.stopButton?.id || '';

    // Populate Endpoints tab
    this._populateEditableList('endpoints', step.endpoints || [], ['label', 'template']);

    // Populate cURL tab
    document.getElementById('step-edit-curl-method').value = step.curl?.method || '';
    document.getElementById('step-edit-curl-url').value = step.curl?.urlTemplate || '';
    this._populateEditableList('curl-headers', Object.entries(step.curl?.headers || {}).map(([k, v]) => ({ key: k, value: v })), ['key', 'value']);
    this._populateEditableList('curl-body', step.curl?.bodyParams || [], ['name', 'source', 'value']);
    document.getElementById('step-edit-curl-show-as-url').checked = !!step.curl?.showAsUrl;
    document.getElementById('step-edit-curl-show-as-qr').checked = !!step.curl?.showAsQR;

    // Populate API tab
    document.getElementById('step-edit-api-endpoint').value = step.api?.endpoint || '';
    document.getElementById('step-edit-api-method').value = step.api?.method || '';
    this._populateEditableList('api-results', step.api?.storeResults || [], ['from', 'to']);

    // Populate Polling tab
    document.getElementById('step-edit-poll-endpoint').value = step.polling?.endpoint || '';
    document.getElementById('step-edit-poll-method').value = step.polling?.method || '';
    document.getElementById('step-edit-poll-interval').value = step.polling?.intervalSource || '';
    document.getElementById('step-edit-poll-success').value = step.polling?.successCondition || '';
    document.getElementById('step-edit-poll-pending').value = step.polling?.pendingCondition || '';
    document.getElementById('step-edit-poll-slowdown').value = step.polling?.slowDownCondition || '';
    document.getElementById('step-edit-poll-expired').value = step.polling?.expiredCondition || '';
    document.getElementById('step-edit-poll-denied').value = step.polling?.deniedCondition || '';
    this._populateEditableList('poll-results', step.polling?.storeResults || [], ['from', 'to']);

    // Populate On Success tab
    document.getElementById('step-edit-unlock-steps').value = (step.onSuccess?.unlockSteps || []).join(', ');
    document.getElementById('step-edit-show-device-code').checked = !!step.onSuccess?.showDeviceCodeDisplay;
    document.getElementById('step-edit-show-token').checked = !!step.onSuccess?.showTokenDisplay;
    document.getElementById('step-edit-result-type').value = step.resultDisplay?.type || '';

    // Populate Sub Functions tab
    this._loadAvailableFunctions().then(() => {
      this._populateSubFunctions(step.subFunctions);
    });

    document.getElementById('step-edit-modal').hidden = false;

    // Re-attach expression autocomplete to populated fields
    if (this.expressionAutocomplete) {
      this.expressionAutocomplete.attachToStepEditModal();
    }
  }

  /**
   * Populate an editable list
   * @private
   */
  _populateEditableList(listId, items, fields) {
    const container = document.getElementById(`step-edit-${listId}-list`);
    if (!container) return;

    container.innerHTML = '';
    items.forEach((item, index) => {
      this._addEditableItemRow(container, listId, fields, item, index);
    });
  }

  /**
   * Add an editable item row
   * @private
   */
  _addEditableItemRow(container, listId, fields, item = {}, index = null) {
    const row = document.createElement('div');
    row.className = `editable-list-item${fields.length > 2 ? ' triple' : ''}`;
    row.dataset.index = index ?? container.children.length;

    fields.forEach(field => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = field;
      input.dataset.field = field;
      input.value = item[field] || '';
      row.appendChild(input);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(removeBtn);

    container.appendChild(row);
  }

  /**
   * Add a new editable item
   * @private
   */
  _addEditableItem(listId) {
    const container = document.getElementById(`step-edit-${listId}-list`);
    if (!container) return;

    const fieldMap = {
      'endpoints': ['label', 'template'],
      'curl-headers': ['key', 'value'],
      'curl-body': ['name', 'source', 'value'],
      'api-results': ['from', 'to'],
      'poll-results': ['from', 'to']
    };

    this._addEditableItemRow(container, listId, fieldMap[listId] || ['key', 'value']);
  }

  /**
   * Collect editable list items
   * @private
   */
  _collectEditableList(listId, fields) {
    const container = document.getElementById(`step-edit-${listId}-list`);
    if (!container) return [];

    return Array.from(container.querySelectorAll('.editable-list-item')).map(row => {
      const item = {};
      fields.forEach(field => {
        const input = row.querySelector(`[data-field="${field}"]`);
        if (input?.value) item[field] = input.value;
      });
      return item;
    }).filter(item => Object.keys(item).length > 0);
  }

  /**
   * Load available sub functions from API
   * @private
   */
  async _loadAvailableFunctions() {
    const container = document.getElementById('subfn-available-list');
    if (!container) return;

    try {
      const res = await fetch('/api/sub-functions');
      if (!res.ok) throw new Error('Failed to load functions');

      const data = await res.json();
      this.availableSubFunctions = data.functions || [];

      // Group by category
      const byCategory = {};
      for (const fn of this.availableSubFunctions) {
        if (!byCategory[fn.category]) byCategory[fn.category] = [];
        byCategory[fn.category].push(fn);
      }

      // Render
      let html = '';
      for (const [cat, fns] of Object.entries(byCategory)) {
        html += `<div class="subfn-category"><strong>${escapeHtml(cat.toUpperCase())}</strong></div>`;
        for (const fn of fns) {
          html += `
            <div class="subfn-available-item" data-fn-id="${escapeHtml(fn.id)}">
              <div class="subfn-available-header">
                <strong>${escapeHtml(fn.name)}</strong>
                <code>${escapeHtml(fn.id)}</code>
              </div>
              <div class="subfn-available-desc">${escapeHtml(fn.description?.split('\n')[0] || '')}</div>
            </div>
          `;
        }
      }

      container.innerHTML = html || '<p>No functions available</p>';

      // Make items clickable to add
      container.querySelectorAll('.subfn-available-item').forEach(item => {
        item.addEventListener('click', () => {
          const fnId = item.dataset.fnId;
          this._addSubFunction(fnId);
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="error">Error loading functions: ${escapeHtml(err.message)}</p>`;
    }
  }

  /**
   * Populate sub functions list for current step
   * @private
   */
  _populateSubFunctions(subFunctions) {
    const container = document.getElementById('step-edit-subfn-list');
    if (!container) return;

    container.innerHTML = '';
    (subFunctions || []).forEach((sf, index) => {
      this._addSubFunctionRow(container, sf, index);
    });
  }

  /**
   * Add a sub function to the list
   * @private
   */
  _addSubFunction(fnId = null) {
    const container = document.getElementById('step-edit-subfn-list');
    if (!container) return;

    const index = container.children.length;
    const sf = fnId ? { fn: fnId, id: `fn${index + 1}` } : {};
    this._addSubFunctionRow(container, sf, index);
  }

  /**
   * Add a sub function row to the editor
   * @private
   */
  _addSubFunctionRow(container, sf, index) {
    const fnDef = this.availableSubFunctions?.find(f => f.id === sf.fn);

    const row = document.createElement('div');
    row.className = 'subfn-item';
    row.dataset.index = index;

    // Function select
    const options = (this.availableSubFunctions || []).map(f =>
      `<option value="${escapeHtml(f.id)}" ${f.id === sf.fn ? 'selected' : ''}>${escapeHtml(f.name)}</option>`
    ).join('');

    row.innerHTML = `
      <div class="subfn-header">
        <select class="subfn-select" data-field="fn">
          <option value="">Select function...</option>
          ${options}
        </select>
        <input type="text" class="subfn-id" data-field="id" placeholder="Step ID (e.g., clientAuth)" value="${escapeHtml(sf.id || '')}">
        <button type="button" class="btn-remove">&times;</button>
      </div>
      <div class="subfn-inputs" id="subfn-inputs-${index}"></div>
      <div class="subfn-store-results">
        <label>Store Results:</label>
        <div class="subfn-store-list" id="subfn-store-${index}"></div>
        <button type="button" class="btn btn-small btn-secondary subfn-add-store" data-index="${index}">+ Add</button>
      </div>
    `;

    container.appendChild(row);

    // Remove button handler
    row.querySelector('.btn-remove').addEventListener('click', () => row.remove());

    // Function change handler
    const select = row.querySelector('.subfn-select');
    select.addEventListener('change', () => this._updateSubFnInputs(row, select.value));

    // Add store result handler
    row.querySelector('.subfn-add-store').addEventListener('click', () => this._addStoreResult(index));

    // Populate inputs if function is selected
    if (sf.fn) {
      this._updateSubFnInputs(row, sf.fn, sf.inputs);
    }

    // Populate store results
    if (sf.storeResults) {
      sf.storeResults.forEach(sr => this._addStoreResult(index, sr));
    }
  }

  /**
   * Update sub function input fields based on selected function
   * @private
   */
  _updateSubFnInputs(row, fnId, values = {}) {
    const container = row.querySelector('.subfn-inputs');
    if (!container) return;

    const fnDef = this.availableSubFunctions?.find(f => f.id === fnId);
    if (!fnDef) {
      container.innerHTML = '<p class="muted">Select a function to configure inputs</p>';
      return;
    }

    // Build input fields from function definition
    let html = '';
    for (const [name, def] of Object.entries(fnDef.inputs || {})) {
      const required = def.required ? '*' : '';
      const value = values[name] || '';
      html += `
        <div class="subfn-input-row">
          <label>${escapeHtml(name)}${required}</label>
          <input type="text" data-input="${escapeHtml(name)}" placeholder="${escapeHtml(def.example || def.description || '')}" value="${escapeHtml(value)}">
        </div>
      `;
    }

    container.innerHTML = html || '<p class="muted">No inputs required</p>';

    // Attach expression autocomplete to new inputs
    container.querySelectorAll('input').forEach(input => {
      this.expressionAutocomplete?.attach(input);
    });
  }

  /**
   * Add a store result row
   * @private
   */
  _addStoreResult(index, sr = {}) {
    const container = document.getElementById(`subfn-store-${index}`);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'subfn-store-row';
    row.innerHTML = `
      <input type="text" data-store="from" placeholder="from (e.g., access_token)" value="${escapeHtml(sr.from || '')}">
      <span>→</span>
      <input type="text" data-store="to" placeholder="to (e.g., idJagToken)" value="${escapeHtml(sr.to || '')}">
      <button type="button" class="btn-remove">&times;</button>
    `;

    row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  /**
   * Collect sub functions from editor
   * @private
   */
  _collectSubFunctions() {
    const container = document.getElementById('step-edit-subfn-list');
    if (!container) return [];

    return Array.from(container.querySelectorAll('.subfn-item')).map(row => {
      const fn = row.querySelector('[data-field="fn"]')?.value;
      const id = row.querySelector('[data-field="id"]')?.value;

      if (!fn) return null;

      // Collect inputs
      const inputs = {};
      row.querySelectorAll('[data-input]').forEach(input => {
        if (input.value) {
          inputs[input.dataset.input] = input.value;
        }
      });

      // Collect store results
      const storeResults = [];
      row.querySelectorAll('.subfn-store-row').forEach(sr => {
        const from = sr.querySelector('[data-store="from"]')?.value;
        const to = sr.querySelector('[data-store="to"]')?.value;
        if (from && to) {
          storeResults.push({ from, to });
        }
      });

      return {
        fn,
        id: id || undefined,
        inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
        storeResults: storeResults.length > 0 ? storeResults : undefined
      };
    }).filter(Boolean);
  }

  /**
   * Close step edit modal
   * @private
   */
  _closeStepEdit() {
    document.getElementById('step-edit-modal').hidden = true;
    this.editingStep = null;
  }

  /**
   * Save step edit changes
   * @private
   */
  async _saveStepEdit() {
    if (!this.editingStep) return;

    const step = this.flow.steps?.find(s => s.number === this.editingStep);
    if (!step) return;

    // Basic tab
    step.id = document.getElementById('step-edit-id').value || undefined;
    step.title = document.getElementById('step-edit-title').value;
    step.description = document.getElementById('step-edit-description').value;
    step.actor = document.getElementById('step-edit-actor').value || undefined;
    step.actorLabel = document.getElementById('step-edit-actor-label').value || undefined;
    step.actorIcon = document.getElementById('step-edit-actor-icon').value || undefined;
    step.info = document.getElementById('step-edit-info').value || undefined;
    step.initiallyLocked = document.getElementById('step-edit-locked').checked;

    // Button tab
    const btnVisible = document.getElementById('step-edit-button-visible').checked;
    const btnShowAsQR = document.getElementById('step-edit-button-show-as-qr').checked;
    const btnLabel = document.getElementById('step-edit-button-label').value;
    const btnAction = document.getElementById('step-edit-button-action').value;
    if (btnLabel || btnAction || btnShowAsQR) {
      step.button = step.button || {};
      step.button.label = btnLabel;
      step.button.action = btnAction || undefined;
      step.button.urlSource = document.getElementById('step-edit-button-url-source').value || undefined;
      step.button.hidden = !btnVisible || undefined; // Only set if hidden, otherwise remove
      step.button.showAsQR = btnShowAsQR || undefined; // Only set if true, otherwise remove
    } else {
      delete step.button;
    }

    const stopLabel = document.getElementById('step-edit-stop-label').value;
    const stopId = document.getElementById('step-edit-stop-id').value;
    if (stopLabel && stopId) {
      step.stopButton = { label: stopLabel, id: stopId };
    } else {
      delete step.stopButton;
    }

    // Endpoints tab
    const endpoints = this._collectEditableList('endpoints', ['label', 'template']);
    if (endpoints.length > 0) {
      step.endpoints = endpoints.map((ep, i) => ({
        ...ep,
        previewId: `endpoint-${step.number}-${i}`
      }));
    } else {
      delete step.endpoints;
    }

    // cURL tab
    const curlMethod = document.getElementById('step-edit-curl-method').value;
    if (curlMethod) {
      step.curl = {
        method: curlMethod,
        urlTemplate: document.getElementById('step-edit-curl-url').value,
        headers: {},
        bodyParams: []
      };
      const headers = this._collectEditableList('curl-headers', ['key', 'value']);
      headers.forEach(h => { if (h.key && h.value) step.curl.headers[h.key] = h.value; });
      step.curl.bodyParams = this._collectEditableList('curl-body', ['name', 'source', 'value']);

      // Display options
      if (document.getElementById('step-edit-curl-show-as-url').checked) {
        step.curl.showAsUrl = true;
      }
      if (document.getElementById('step-edit-curl-show-as-qr').checked) {
        step.curl.showAsQR = true;
      }
    } else {
      delete step.curl;
    }

    // API tab
    const apiMethod = document.getElementById('step-edit-api-method').value;
    if (apiMethod) {
      step.api = {
        endpoint: document.getElementById('step-edit-api-endpoint').value,
        method: apiMethod,
        storeResults: this._collectEditableList('api-results', ['from', 'to'])
      };
    } else {
      delete step.api;
    }

    // Polling tab
    const pollMethod = document.getElementById('step-edit-poll-method').value;
    if (pollMethod) {
      step.polling = {
        endpoint: document.getElementById('step-edit-poll-endpoint').value,
        method: pollMethod,
        intervalSource: document.getElementById('step-edit-poll-interval').value || undefined,
        successCondition: document.getElementById('step-edit-poll-success').value || undefined,
        pendingCondition: document.getElementById('step-edit-poll-pending').value || undefined,
        slowDownCondition: document.getElementById('step-edit-poll-slowdown').value || undefined,
        expiredCondition: document.getElementById('step-edit-poll-expired').value || undefined,
        deniedCondition: document.getElementById('step-edit-poll-denied').value || undefined,
        storeResults: this._collectEditableList('poll-results', ['from', 'to'])
      };
    } else {
      delete step.polling;
    }

    // On Success tab
    const unlockStepsStr = document.getElementById('step-edit-unlock-steps').value;
    const showDeviceCode = document.getElementById('step-edit-show-device-code').checked;
    const showToken = document.getElementById('step-edit-show-token').checked;
    if (unlockStepsStr || showDeviceCode || showToken) {
      step.onSuccess = {};
      if (unlockStepsStr) {
        step.onSuccess.unlockSteps = unlockStepsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      }
      if (showDeviceCode) step.onSuccess.showDeviceCodeDisplay = true;
      if (showToken) step.onSuccess.showTokenDisplay = true;
    } else {
      delete step.onSuccess;
    }

    const resultType = document.getElementById('step-edit-result-type').value;
    if (resultType) {
      step.resultDisplay = { type: resultType };
    } else {
      delete step.resultDisplay;
    }

    // Sub Functions tab
    const subFunctions = this._collectSubFunctions();
    if (subFunctions.length > 0) {
      step.subFunctions = subFunctions;
    } else {
      delete step.subFunctions;
    }

    // Save to server
    const saved = await this._saveFlowToServer();
    if (!saved) {
      // Don't close modal if save failed
      return;
    }

    // Re-render the entire flow to reflect changes
    this._reRenderFlow();
    this._closeStepEdit();
  }

  /**
   * Delete the current step
   * @private
   */
  async _deleteStep() {
    if (!this.editingStep) return;

    const confirmed = await this.dialog.confirm(`Delete Step ${this.editingStep}? This cannot be undone.`, 'Delete Step');
    if (!confirmed) return;

    // Remove step from flow
    const stepIndex = this.flow.steps.findIndex(s => s.number === this.editingStep);
    if (stepIndex === -1) return;

    this.flow.steps.splice(stepIndex, 1);

    // Renumber remaining steps
    this.flow.steps.forEach((s, i) => {
      s.number = i + 1;
    });

    // Save to server
    const saved = await this._saveFlowToServer();
    if (!saved) {
      // Reload the flow to restore the deleted step
      const reloaded = await fetch(`/api/flows/${this.flow.id}?reload=true`);
      if (reloaded.ok) {
        this.flow = await reloaded.json();
      }
      return;
    }

    this._closeStepEdit();
    this._reRenderFlow();
  }

  /**
   * Move a step up or down
   * @private
   */
  async _moveStep(stepNumber, direction) {
    const currentIndex = this.flow.steps.findIndex(s => s.number === stepNumber);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check bounds
    if (newIndex < 0 || newIndex >= this.flow.steps.length) return;

    // Swap steps
    const temp = this.flow.steps[currentIndex];
    this.flow.steps[currentIndex] = this.flow.steps[newIndex];
    this.flow.steps[newIndex] = temp;

    // Renumber all steps
    this.flow.steps.forEach((s, i) => {
      s.number = i + 1;
    });

    // Save to server
    await this._saveFlowToServer();

    // Re-render
    this._reRenderFlow();
  }

  /**
   * Update move button states (disable at edges)
   * @private
   */
  _updateMoveButtons() {
    const totalSteps = this.flow.steps?.length || 0;

    document.querySelectorAll('.step-move-btn').forEach(btn => {
      const stepNum = parseInt(btn.dataset.step, 10);
      const direction = btn.dataset.direction;

      if (direction === 'up') {
        btn.disabled = stepNum === 1;
      } else {
        btn.disabled = stepNum === totalSteps;
      }
    });
  }

  /**
   * Add a new step after the specified step number
   * @private
   */
  async _addStepAfter(afterStepNumber) {
    const newStep = {
      number: afterStepNumber + 1,
      id: `new-step-${Date.now()}`,
      title: 'New Step',
      description: 'Enter step description',
      actor: 'device',
      actorLabel: 'Device',
      initiallyLocked: true,
      button: {
        label: 'Execute',
        action: 'api'
      }
    };

    // Insert the new step
    const insertIndex = this.flow.steps.findIndex(s => s.number === afterStepNumber);
    if (insertIndex === -1) {
      this.flow.steps.push(newStep);
    } else {
      this.flow.steps.splice(insertIndex + 1, 0, newStep);
    }

    // Renumber all steps
    this.flow.steps.forEach((s, i) => {
      s.number = i + 1;
    });

    // Save to server
    await this._saveFlowToServer();

    // Re-render and stay in edit mode
    this._reRenderFlow();

    // Open the new step for editing
    this._openStepEdit(newStep.number);
  }

  /**
   * Re-render the entire flow UI
   * @private
   */
  _reRenderFlow() {
    const wasEditMode = this.editMode;

    // Re-render using the renderer
    this.renderer = renderFlow(this.flow, this.containerId);

    // Re-bind event handlers
    this._bindEventHandlers();

    // Restore edit mode if it was active
    if (wasEditMode) {
      this.editMode = false; // Reset so setEditMode works
      this._setEditMode(true);
    }

    // Reload config and update UI
    this.config.loadFromStorage();
    this.updateCurlCommands();
    this.steps = new StepController({ totalSteps: this.flow.steps?.length || 0 });

    // Reinitialize expression autocomplete
    if (this.expressionAutocomplete) {
      this.expressionAutocomplete.updateFlow(this.flow);
      this.expressionAutocomplete.attachToStepEditModal();
    }
  }

  /**
   * Update step UI after edit (minimal update for simple changes)
   * @private
   */
  _updateStepUI(step) {
    const stepEl = document.getElementById(`step-${step.number}`);
    if (!stepEl) return;

    // Update title
    const titleEl = stepEl.querySelector('.step-info h3');
    if (titleEl) titleEl.textContent = step.title;

    // Update description
    const descEl = stepEl.querySelector('.step-info > p');
    if (descEl) descEl.textContent = step.description || '';

    // Update actor badge
    const actorEl = stepEl.querySelector('.actor');
    if (step.actor) {
      const actorClass = step.actor === 'device' ? 'actor-app' :
                         step.actor === 'user' ? 'actor-agent' :
                         `actor-${step.actor}`;
      if (actorEl) {
        actorEl.className = `actor ${actorClass}`;
        actorEl.textContent = step.actorLabel || step.actor;
      } else {
        const infoEl = stepEl.querySelector('.step-info');
        if (infoEl) {
          const badge = document.createElement('span');
          badge.className = `actor ${actorClass}`;
          badge.textContent = step.actorLabel || step.actor;
          infoEl.insertBefore(badge, infoEl.firstChild);
        }
      }
    } else if (actorEl) {
      actorEl.remove();
    }

    // Update button label
    const btn = document.getElementById(`btn-step-${step.number}`);
    if (btn && step.button?.label) {
      btn.textContent = step.button.label;
    }

    // Update info text
    let infoEl = stepEl.querySelector('.step-info-text');
    if (step.info) {
      if (infoEl) {
        infoEl.textContent = step.info;
      } else {
        const stepInfoDiv = stepEl.querySelector('.step-info');
        if (stepInfoDiv) {
          const infoP = document.createElement('p');
          infoP.className = 'step-info-text';
          infoP.textContent = step.info;
          stepInfoDiv.appendChild(infoP);
        }
      }
    } else if (infoEl) {
      infoEl.remove();
    }

    // Update locked state class
    if (step.initiallyLocked) {
      stepEl.classList.add('locked');
    } else {
      stepEl.classList.remove('locked');
    }
  }

  /**
   * Handle step action button click
   * @private
   */
  async _handleStepAction(step) {
    const action = step.button?.action;

    // Check for custom handler first
    const handlerName = this.flow.customHandlers?.[`step${step.number}`];
    if (handlerName && this.customHandlers[handlerName]) {
      return this.customHandlers[handlerName](step, this);
    }

    // Built-in actions
    switch (action) {
      case 'api':
        return this._executeApiStep(step);
      case 'openUrl':
        return this._executeOpenUrl(step);
      case 'poll':
        return this._startPolling(step);
      case 'oauth':
        return this._executeOAuth(step);
      case 'subFunctions':
        return this._executeSubFunctions(step);
      default:
        console.warn(`Unknown step action: ${action}`);
    }
  }

  /**
   * Execute an API step
   * @private
   */
  async _executeApiStep(step) {
    const cfg = this.config.getConfig();

    // Validate required fields
    if (!cfg.oktaDomain || !cfg.clientId) {
      await this.dialog.alert('Please configure Okta Domain and Client ID.', 'Missing Configuration');
      return;
    }

    this.steps.showLoading(step.number);

    try {
      const { api } = step;
      if (!api) throw new Error('No API configuration for step');

      const body = this._interpolateTemplate(api.bodyTemplate || { config: cfg }, { config: cfg, state: this.state });

      const res = await fetch(api.endpoint, {
        method: api.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      // Store results in state
      if (api.storeResults) {
        api.storeResults.forEach(({ from, to, default: defaultVal }) => {
          this.state[to] = data[from] ?? defaultVal;
        });
      }

      // Show actual cURL
      if (data.curl) {
        showActualCurl(`curl-${step.number}`, data.curl);
      }

      // Handle success
      this.steps.complete(step.number);
      this._handleStepSuccess(step, data);

    } catch (err) {
      this.steps.error(step.number, err.message);
    }
  }

  /**
   * Execute open URL action
   * @private
   */
  _executeOpenUrl(step) {
    const urlSource = step.button?.urlSource;
    if (!urlSource) return;

    // Evaluate the URL source expression
    const url = this._evaluateExpression(urlSource);
    if (url) {
      window.open(url, '_blank');
    }
  }

  /**
   * Start polling for a step
   * @private
   */
  async _startPolling(step) {
    const cfg = this.config.getConfig();
    const { polling } = step;
    if (!polling) return;

    this.pollCount = 0;
    const interval = this.state[polling.intervalSource?.split('.')[1]] || 5;

    // UI updates
    const btn = document.getElementById(`btn-step-${step.number}`);
    if (btn) btn.disabled = true;

    const stopBtn = step.stopButton?.id ? document.getElementById(step.stopButton.id) : null;
    if (stopBtn) stopBtn.hidden = false;

    this.steps.showResult(step.number, this._createPollingStatus('Polling for authorization...', 'pending'));

    this.pollingTimer = setInterval(async () => {
      this.pollCount++;
      this._updatePollingStatus(`Polling... (attempt ${this.pollCount})`);

      try {
        const body = this._interpolateTemplate(polling.bodyTemplate || { config: cfg }, { config: cfg, state: this.state });

        const res = await fetch(polling.endpoint, {
          method: polling.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        // Check conditions
        if (this._evaluateCondition(polling.successCondition, data)) {
          // Success!
          this._stopPolling();

          // Store tokens
          if (polling.storeResults) {
            polling.storeResults.forEach(({ from, to }) => {
              if (data[from]) {
                this.state[to] = data[from];
                this.tokens[to] = data[from];
              }
            });
          }

          this.steps.complete(step.number);
          this.steps.showResult(step.number, this._createPollingStatus('Authorization successful!', 'success'));
          this._handleStepSuccess(step, data);

        } else if (this._evaluateCondition(polling.pendingCondition, data)) {
          this._updatePollingStatus(`Waiting for user authorization... (attempt ${this.pollCount})`);

        } else if (this._evaluateCondition(polling.slowDownCondition, data)) {
          // Increase interval
          const currentInterval = this.state[polling.intervalSource?.split('.')[1]] || 5;
          this.state[polling.intervalSource?.split('.')[1]] = currentInterval + 5;
          this._updatePollingStatus(`Slowing down polling...`);

        } else if (this._evaluateCondition(polling.expiredCondition, data)) {
          this._stopPolling();
          this.steps.error(step.number, 'Device code expired. Please restart the flow.');

        } else if (this._evaluateCondition(polling.deniedCondition, data)) {
          this._stopPolling();
          this.steps.error(step.number, 'User denied the authorization request.');

        } else if (data.error) {
          this._stopPolling();
          this.steps.error(step.number, data.error_description || data.error);
        }

      } catch (err) {
        this._stopPolling();
        this.steps.error(step.number, err.message);
      }

    }, interval * 1000);
  }

  /**
   * Stop polling
   * @private
   */
  _stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Re-enable buttons
    this.flow.steps?.forEach(step => {
      if (step.polling) {
        const btn = document.getElementById(`btn-step-${step.number}`);
        if (btn) btn.disabled = false;

        if (step.stopButton?.id) {
          const stopBtn = document.getElementById(step.stopButton.id);
          if (stopBtn) stopBtn.hidden = true;
        }
      }
    });
  }

  /**
   * Handle step success actions
   * @private
   */
  _handleStepSuccess(step, data) {
    const { onSuccess } = step;
    if (!onSuccess) return;

    // Unlock steps
    if (onSuccess.unlockSteps) {
      onSuccess.unlockSteps.forEach(n => this.steps.unlock(n));
    }

    // Show device code display (legacy standalone)
    if (onSuccess.showDeviceCodeDisplay) {
      const display = document.getElementById('device-code-display');
      if (display) {
        display.hidden = false;
        document.getElementById('user-code-value').textContent = this.state.userCode;
        const link = document.getElementById('verification-uri-link');
        link.href = this.state.verificationUriComplete || this.state.verificationUri;
        link.textContent = this.state.verificationUri;
      }
    }

    // Update inline device code displays in subsequent steps
    this._updateDeviceCodeDisplays();

    // Show token display
    if (onSuccess.showTokenDisplay) {
      const tokenDetails = document.getElementById('token-details');
      if (tokenDetails) {
        tokenDetails.hidden = false;
        this._switchTokenTab(this.flow.tokenDisplay?.tabs?.[0]?.id || 'access-token');
      }
    }

    this.updateCurlCommands();
  }

  /**
   * Switch token display tab
   * @private
   */
  _switchTokenTab(tabId) {
    // Update tab active states
    document.querySelectorAll('.token-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    const tabConfig = this.flow.tokenDisplay?.tabs?.find(t => t.id === tabId);
    if (!tabConfig) return;

    const token = this.tokens[tabConfig.tokenKey];
    const content = document.getElementById('token-content');

    if (content) {
      content.innerHTML = this.tokenDisplay.renderTokenDetails(token, tabConfig.label);
      this.tokenDisplay.bindRawCopyButtons(content);
    }
  }

  /**
   * Create polling status HTML
   * @private
   */
  _createPollingStatus(message, status) {
    let className = 'polling-status';
    if (status === 'success') className += ' success';
    if (status === 'error') className += ' error';

    let html = `<div class="${className}">`;
    if (status === 'pending') {
      html += '<div class="polling-spinner"></div>';
    }
    html += `<span>${escapeHtml(message)}</span>`;
    if (status === 'pending') {
      html += `<span class="polling-count">(attempt ${this.pollCount})</span>`;
    }
    html += '</div>';
    return html;
  }

  /**
   * Update polling status message
   * @private
   */
  _updatePollingStatus(message) {
    // Find the polling step
    const pollingStep = this.flow.steps?.find(s => s.polling);
    if (!pollingStep) return;

    const resultEl = document.getElementById(`result-${pollingStep.number}`);
    const statusEl = resultEl?.querySelector('.polling-status span');
    const countEl = resultEl?.querySelector('.polling-count');

    if (statusEl) statusEl.textContent = message;
    if (countEl) countEl.textContent = `(attempt ${this.pollCount})`;
  }

  /**
   * Update all cURL commands
   */
  updateCurlCommands() {
    const cfg = this.config.getConfig();
    const basePath = this.authServerPicker?.getBasePath() || 'oauth2/v1';

    this.flow.steps?.forEach(step => {
      const curlEl = document.getElementById(`curl-${step.number}`);
      if (!curlEl || curlEl.classList.contains('curl-actual')) return;

      if (step.curl) {
        const curl = this._buildCurlCommand(step.curl, { config: cfg, state: this.state, basePath });
        curlEl.innerHTML = formatCurl(curl);

        // Update QR code if enabled
        if (step.curl.showAsQR) {
          const qrImg = document.getElementById(`curl-qr-img-${step.number}`);
          if (qrImg) {
            // Extract the URL from the cURL template
            let url = this._interpolateString(step.curl.urlTemplate, { config: cfg, state: this.state, basePath });
            url = url.replace('{{basePath}}', basePath);

            // Only update if URL is complete (no unresolved placeholders)
            if (url && !url.includes('{{') && (url.startsWith('http://') || url.startsWith('https://'))) {
              const encodedUrl = encodeURIComponent(url);
              qrImg.src = `/api/utility/qr/url/${encodedUrl}?size=150`;
              qrImg.alt = 'QR Code for URL';
            } else {
              // Use transparent placeholder to avoid layout jolt
              qrImg.src = '/api/utility/qr/url/BLANK_PLACEHOLDER?size=150';
              qrImg.alt = 'QR Code (waiting for URL)';
            }
          }
        }
      }
    });

    // Update endpoint previews
    this.flow.steps?.forEach(step => {
      step.endpoints?.forEach(ep => {
        const previewEl = document.getElementById(ep.previewId);
        if (previewEl) {
          previewEl.textContent = ep.template.replace('{{basePath}}', basePath);
        }
      });
    });

    // Update button QR codes
    this.flow.steps?.forEach(step => {
      if (step.button?.showAsQR && step.button?.urlSource) {
        const qrImg = document.getElementById(`btn-qr-img-${step.number}`);
        if (qrImg) {
          // Evaluate the URL source expression
          const url = this._evaluateExpression(step.button.urlSource);

          // Only update if URL is complete (no unresolved placeholders)
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const encodedUrl = encodeURIComponent(url);
            qrImg.src = `/api/utility/qr/url/${encodedUrl}?size=150`;
            qrImg.alt = 'Scan to open URL';
          } else {
            // Use transparent placeholder to avoid layout jolt
            qrImg.src = '/api/utility/qr/url/BLANK_PLACEHOLDER?size=150';
            qrImg.alt = 'QR Code (waiting for URL)';
          }
        }
      }
    });
  }

  /**
   * Build a cURL command from template
   * @private
   */
  _buildCurlCommand(curlConfig, context) {
    const { method = 'POST', urlTemplate, headers = {}, bodyParams = [], showAsUrl } = curlConfig;

    let url = this._interpolateString(urlTemplate, context);
    url = url.replace('{{basePath}}', context.basePath || 'oauth2/v1');

    // If showAsUrl is true, just display the URL
    if (showAsUrl) {
      return url || '<URL will appear after previous step completes>';
    }

    const lines = [`curl --request ${method} \\`, `  --url "${url}" \\`];

    // Add headers
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`  -H "${key}: ${value}" \\`);
    }

    // Add body params
    bodyParams.forEach((param, i) => {
      let value = param.value;
      if (param.source) {
        value = this._evaluateExpression(param.source, context) || `<${param.name.toUpperCase()}>`;
      }
      const isLast = i === bodyParams.length - 1;
      lines.push(`  -d "${param.name}=${value}"${isLast ? '' : ' \\'}`);
    });

    return lines.join('\n');
  }

  /**
   * Interpolate a template object
   * @private
   */
  _interpolateTemplate(template, context) {
    if (typeof template === 'string') {
      return this._interpolateString(template, context);
    }

    if (Array.isArray(template)) {
      return template.map(item => this._interpolateTemplate(item, context));
    }

    if (typeof template === 'object' && template !== null) {
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        if (value === '{{config}}') {
          result[key] = context.config;
        } else if (value === '{{state}}') {
          result[key] = context.state;
        } else {
          result[key] = this._interpolateTemplate(value, context);
        }
      }
      return result;
    }

    return template;
  }

  /**
   * Interpolate a string template
   * @private
   */
  _interpolateString(str, context) {
    return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      return this._evaluateExpression(path, context) ?? match;
    });
  }

  /**
   * Evaluate a simple expression
   * @private
   */
  _evaluateExpression(expr, context = { config: this.config?.getConfig(), state: this.state }) {
    // Handle OR expressions (e.g., "state.verificationUriComplete || state.verificationUri")
    if (expr.includes('||')) {
      const parts = expr.split('||').map(p => p.trim());
      for (const part of parts) {
        const value = this._evaluateExpression(part, context);
        if (value) return value;
      }
      return null;
    }

    // Handle dot notation (e.g., "config.clientId" or "state.deviceCode")
    const parts = expr.split('.');
    let value = context;

    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    return value;
  }

  /**
   * Evaluate a condition expression
   * @private
   */
  _evaluateCondition(condition, data) {
    if (!condition) return false;

    // Simple equality check (e.g., "response.error === 'authorization_pending'")
    const eqMatch = condition.match(/response\.(\w+)\s*===\s*'([^']+)'/);
    if (eqMatch) {
      return data[eqMatch[1]] === eqMatch[2];
    }

    // Simple existence check (e.g., "response.access_token")
    const existMatch = condition.match(/response\.(\w+)/);
    if (existMatch) {
      return !!data[existMatch[1]];
    }

    return false;
  }

  /**
   * Execute OAuth step (opens popup)
   * @private
   */
  async _executeOAuth(step) {
    // This would be implemented for flows that need OAuth popups
    // For now, log a warning
    console.warn('OAuth step execution not yet implemented in generic engine');
  }

  /**
   * Execute sub-functions chain for a step
   * @private
   */
  async _executeSubFunctions(step) {
    const { subFunctions } = step;
    if (!subFunctions || !Array.isArray(subFunctions) || subFunctions.length === 0) {
      console.warn(`Step ${step.number} has no subFunctions configured`);
      return;
    }

    const cfg = this.config.getConfig();

    this.steps.showLoading(step.number);

    try {
      // Build context for template resolution
      const context = {
        config: cfg,
        state: this.state
      };

      // Execute the chain via API
      const res = await fetch('/api/sub-functions/chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: subFunctions,
          context
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Sub-function chain failed');
      }

      // Apply state updates from storeResults
      if (data.stateUpdates) {
        for (const [key, value] of Object.entries(data.stateUpdates)) {
          this.state[key] = value;
          // Also store tokens if they look like JWTs
          if (typeof value === 'string' && value.includes('.')) {
            this.tokens[key] = value;
          }
        }
      }

      // Show cURL commands from the results
      const curlCommands = data.results
        .filter(r => r.curl)
        .map(r => `# ${r.fn} (${r.id})\n${r.curl}`)
        .join('\n\n');

      if (curlCommands) {
        showActualCurl(`curl-${step.number}`, curlCommands);
      }

      // Show result summary
      const resultSummary = data.results
        .map(r => `${r.id}: ${r.success ? 'OK' : 'Failed'}`)
        .join(' → ');

      this.steps.complete(step.number);
      this.steps.showResult(step.number, `<div class="result success">Sub-functions completed: ${escapeHtml(resultSummary)}</div>`);

      // Handle success actions
      this._handleStepSuccess(step, data);

    } catch (err) {
      this.steps.error(step.number, err.message);
    }
  }
}

/**
 * Quick initialization helper
 * @param {string|object} flowIdOrDefinition - Flow ID or definition
 * @param {object} options - Engine options
 * @returns {Promise<FlowEngine>}
 */
export async function initFlow(flowIdOrDefinition, options = {}) {
  const engine = new FlowEngine(flowIdOrDefinition, options);
  await engine.init();
  return engine;
}

export default FlowEngine;
