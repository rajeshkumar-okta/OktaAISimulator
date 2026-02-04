/**
 * FlowRenderer - Generates HTML from JSON flow definitions
 *
 * This component takes a flow definition and renders the UI components:
 * - Configuration panel with fields
 * - Step cards with buttons and cURL displays
 * - Token display area
 *
 * Usage:
 *   import { FlowRenderer } from './lib/flow-engine/FlowRenderer.js';
 *   const renderer = new FlowRenderer(flowDefinition);
 *   document.getElementById('config-panel').innerHTML = renderer.renderConfigPanel();
 *   document.getElementById('steps-container').innerHTML = renderer.renderSteps();
 */

import { escapeHtml, escapeAttr } from './CurlGenerator.js';

export class FlowRenderer {
  /**
   * @param {object} flowDefinition - The JSON flow definition
   */
  constructor(flowDefinition) {
    this.flow = flowDefinition;
  }

  /**
   * Render the complete flow page header
   * @returns {string} - HTML string
   */
  renderHeader() {
    const { name, subtitle, documentation, state } = this.flow;

    let docLink = '';
    if (documentation?.url) {
      const label = documentation.label || 'Documentation';
      docLink = `<a href="${escapeAttr(documentation.url)}" target="_blank" class="doc-link" title="${escapeAttr(label)}">${escapeHtml(label)}</a>`;
    }

    // State selector (hidden by default, shown in edit mode)
    const stateSelector = `
      <div class="flow-state-selector" id="flow-state-selector" hidden>
        <label>State:</label>
        <select id="flow-state-select">
          <option value="draft" ${state === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="testing" ${state === 'testing' ? 'selected' : ''}>Testing</option>
          <option value="ready" ${state === 'ready' ? 'selected' : ''}>Ready</option>
        </select>
      </div>
    `;

    return `
      <nav class="breadcrumb">
        <a href="/">← All Flows</a>
        ${stateSelector}
        ${docLink}
      </nav>
      <header>
        <h1>${escapeHtml(name)}</h1>
        ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </header>
    `;
  }

  /**
   * Render the configuration panel
   * @returns {string} - HTML string
   */
  renderConfigPanel() {
    const { configSections, configFields } = this.flow;

    if (!configSections || !configFields) {
      return '<p>No configuration required.</p>';
    }

    const fieldMap = new Map(configFields.map(f => [f.id, f]));

    const sectionsHtml = configSections.map((section, index) => {
      const fields = section.fields.map(fieldId => {
        const field = fieldMap.get(fieldId);
        if (!field) return '';
        return this._renderField(field);
      }).join('');

      // Add section divider before section (except first)
      const divider = index > 0 ? `
        <div class="config-section-divider">
          <span>${escapeHtml(section.title)}</span>
        </div>
      ` : '';

      return divider + fields;
    }).join('');

    return `
      <div class="config-fields">
        ${sectionsHtml}
        <div class="config-actions">
          <button class="btn btn-primary btn-small" id="save-config-btn">Save to Browser</button>
          <button class="btn btn-primary btn-small" id="save-server-btn">Save to Server</button>
          <button class="btn btn-secondary btn-small" id="clear-config-btn">Clear Saved</button>
        </div>
      </div>
    `;
  }

  /**
   * Render a single configuration field
   * @private
   */
  _renderField(field) {
    const id = `cfg-${field.id}`;
    const required = field.required ? 'required' : '';
    const placeholder = field.placeholder || '';
    const optionalLabel = !field.required ? '<span class="label-optional">(optional)</span>' : '';

    let input = '';

    switch (field.type) {
      case 'text':
      case 'password':
        input = `<input type="${field.type}" id="${id}" name="${field.id}" placeholder="${escapeAttr(placeholder)}" ${required}>`;
        break;

      case 'textarea':
        input = `<textarea id="${id}" name="${field.id}" placeholder="${escapeAttr(placeholder)}" rows="${field.rows || 2}" ${required}></textarea>`;
        break;

      case 'select':
        const options = (field.options || []).map(opt =>
          `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`
        ).join('');
        input = `<select id="${id}" name="${field.id}" ${required}>${options}</select>`;
        break;

      case 'auth-server-picker':
        input = this._renderAuthServerPicker(field);
        break;

      case 'scope-selector':
        input = this._renderScopeSelector(field);
        break;

      case 'client-auth-toggle':
        input = this._renderClientAuthToggle(field);
        break;

      default:
        input = `<input type="text" id="${id}" name="${field.id}" placeholder="${escapeAttr(placeholder)}" ${required}>`;
    }

    // Special case: add domain link for oktaDomain field
    let domainLink = '';
    if (field.id === 'oktaDomain') {
      domainLink = '<a href="#" id="okta-domain-link" class="domain-link" target="_blank" hidden title="Open Okta Admin Console">Open ↗</a>';
    }

    return `
      <div class="config-row">
        <label for="${id}">${escapeHtml(field.label)} ${optionalLabel} ${domainLink}</label>
        ${input}
      </div>
    `;
  }

  /**
   * Render auth server picker component
   * @private
   */
  _renderAuthServerPicker(field) {
    const id = `cfg-${field.id}`;
    const options = (field.options || [
      { value: 'org', label: 'Org Authorization Server (v1)' },
      { value: 'default', label: 'Default Custom Auth Server' },
      { value: 'custom', label: 'Custom Auth Server ID' }
    ]).map(opt =>
      `<option value="${escapeAttr(opt.value)}" ${opt.value === field.default ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
    ).join('');

    return `
      <div class="redirect-uri-group">
        <select id="${id}" name="${field.id}">
          ${options}
        </select>
        <input type="text" id="cfg-authorizationServerId" placeholder="Custom Auth Server ID" hidden>
        <span class="auth-server-preview" id="auth-server-preview"></span>
      </div>
    `;
  }

  /**
   * Render scope selector component
   * @private
   */
  _renderScopeSelector(field) {
    const id = `cfg-${field.id}`;
    const defaultScopes = field.default || 'openid profile email offline_access';

    return `
      <div class="scope-selector" id="scope-selector">
        <div class="scope-tiles" id="scope-tiles">
          <span class="scope-loading" id="scope-loading">Configure Okta Domain and Auth Server to load scopes</span>
        </div>
        <div class="scope-custom-input">
          <input type="text" id="scope-custom-input" placeholder="Add custom scope...">
          <button type="button" class="btn btn-small btn-secondary" id="scope-add-btn">Add</button>
        </div>
        <input type="hidden" id="${id}" name="${field.id}" value="${escapeAttr(defaultScopes)}">
      </div>
    `;
  }

  /**
   * Render client auth toggle component
   * @private
   */
  _renderClientAuthToggle(field) {
    const id = `cfg-${field.id}`;
    const options = field.options || [
      { value: 'secret', label: 'Client Secret' },
      { value: 'private_key', label: 'Private Key JWT' },
      { value: 'pkce', label: 'PKCE (Public Client)' }
    ];

    const radios = options.map((opt, i) => `
      <label class="radio-option">
        <input type="radio" name="${field.id}" value="${escapeAttr(opt.value)}" ${i === 0 ? 'checked' : ''}>
        ${escapeHtml(opt.label)}
      </label>
    `).join('');

    return `
      <div class="client-auth-toggle" id="${id}">
        ${radios}
      </div>
    `;
  }

  /**
   * Render all flow steps
   * @returns {string} - HTML string
   */
  renderSteps() {
    const { steps } = this.flow;

    if (!steps || steps.length === 0) {
      return '<p>No steps defined.</p>';
    }

    return steps.map(step => this._renderStep(step)).join('');
  }

  /**
   * Render a single step
   * @private
   */
  _renderStep(step) {
    const locked = step.initiallyLocked ? 'locked' : '';

    // Actor badge - map to existing actor classes
    const actorClass = step.actor === 'device' ? 'actor-app' :
                       step.actor === 'user' ? 'actor-agent' :
                       `actor-${step.actor}`;
    const actorBadge = step.actor ? `<span class="actor ${actorClass}">${escapeHtml(step.actorLabel || step.actor)}</span>` : '';

    // Endpoints preview
    let endpointsHtml = '';
    if (step.endpoints) {
      endpointsHtml = step.endpoints.map(ep => `
        <div class="step-option">
          <code class="uri-template" id="${escapeAttr(ep.previewId)}">${escapeHtml(ep.template)}</code>
        </div>
      `).join('');
    }

    // Button(s) - can be replaced with QR code if showAsQR is true
    let buttonHtml = '';
    if (step.button && !step.button.hidden) {
      if (step.button.showAsQR) {
        // Show QR code instead of button - use placeholder to avoid layout jolt
        buttonHtml = `
          <div class="button-qr-display" id="btn-qr-${step.number}">
            <img src="/api/utility/qr/url/BLANK_PLACEHOLDER?size=150" alt="QR Code (waiting for URL)" class="button-qr-image" id="btn-qr-img-${step.number}">
          </div>
        `;
      } else {
        const disabled = step.initiallyLocked ? 'disabled' : '';
        const btnClass = step.initiallyLocked ? 'btn btn-secondary' : 'btn btn-primary';
        buttonHtml = `<button class="${btnClass}" id="btn-step-${step.number}" ${disabled}>${escapeHtml(step.button.label)}</button>`;
      }
    }

    // Stop button (for polling steps)
    let stopButtonHtml = '';
    if (step.stopButton) {
      stopButtonHtml = `<button class="btn btn-secondary btn-small" id="${escapeAttr(step.stopButton.id)}" hidden>${escapeHtml(step.stopButton.label)}</button>`;
    }

    // Edit controls (hidden by default, shown in edit mode) - positioned absolutely in top-right
    const editButtonHtml = `
      <div class="step-edit-controls" hidden>
        <button class="btn btn-secondary btn-small step-move-btn" data-step="${step.number}" data-direction="up" title="Move up">&#9650;</button>
        <button class="btn btn-secondary btn-small step-move-btn" data-step="${step.number}" data-direction="down" title="Move down">&#9660;</button>
        <button class="btn btn-secondary btn-small step-edit-btn" data-step="${step.number}" title="Edit step">&#9998;</button>
      </div>`;

    // Wrap buttons in action group (without edit button - it's positioned separately)
    let actionsHtml = `<div class="step-action-group">${buttonHtml}${stopButtonHtml}</div>`;

    // cURL display
    let curlHtml = '';
    if (step.curl) {
      // Use placeholder to avoid layout jolt before URL is generated
      const qrHtml = step.curl.showAsQR ? `
        <div class="curl-qr-display" id="curl-qr-${step.number}">
          <img src="/api/utility/qr/url/BLANK_PLACEHOLDER?size=150" alt="QR Code (waiting for URL)" class="curl-qr-image" id="curl-qr-img-${step.number}">
        </div>
      ` : '';

      curlHtml = `
        <details class="curl-section">
          <summary>cURL Command</summary>
          <div class="curl-with-qr">
            <pre class="curl-box" id="curl-${step.number}"></pre>
            ${qrHtml}
          </div>
        </details>
      `;
    }

    // Info text
    let infoHtml = '';
    if (step.info) {
      infoHtml = `<p class="step-info-text">${escapeHtml(step.info)}</p>`;
    }

    // Device code display
    let deviceCodeHtml = '';
    if (step.deviceCodeDisplay) {
      deviceCodeHtml = `
        <div class="device-code-display-inline" id="device-code-display-${step.number}" hidden>
          <div class="device-code-content">
            <div class="user-code-section">
              <div class="user-code-label">Enter this code:</div>
              <div class="user-code" id="user-code-${step.number}">--------</div>
              <div class="verification-uri">
                <span>at</span>
                <a href="#" id="verification-uri-${step.number}" target="_blank">-</a>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Add step button (shown in edit mode)
    const addStepHtml = `
      <div class="add-step-container" data-after="${step.number}" hidden>
        <button class="btn btn-secondary btn-small add-step-btn" data-after="${step.number}">+ Add Step After</button>
      </div>
    `;

    return `
      <div class="step ${locked}" id="step-${step.number}">
        ${editButtonHtml}
        <div class="step-header">
          <span class="step-number">${step.number}</span>
          <div class="step-info">
            ${actorBadge}
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.description || '')}</p>
            ${endpointsHtml}
            ${infoHtml}
            ${deviceCodeHtml}
          </div>
          ${actionsHtml}
        </div>
        ${curlHtml}
        <div class="step-result" id="result-${step.number}"></div>
      </div>
      ${addStepHtml}
    `;
  }

  /**
   * Render token display area
   * @returns {string} - HTML string
   */
  renderTokenDisplay() {
    const { tokenDisplay } = this.flow;

    if (!tokenDisplay?.show) {
      return '';
    }

    const tabs = (tokenDisplay.tabs || []).map(tab => `
      <button class="token-tab" data-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>
    `).join('');

    return `
      <div class="token-details" id="${escapeAttr(tokenDisplay.containerId || 'token-details')}" hidden>
        <h3>Token Details</h3>
        <div class="token-tabs">
          ${tabs}
        </div>
        <div class="token-content" id="token-content"></div>
      </div>
    `;
  }

  /**
   * Render device code display (for device flow)
   * @returns {string} - HTML string
   */
  renderDeviceCodeDisplay() {
    return `
      <div class="device-code-display" id="device-code-display" hidden>
        <div class="user-code-label">Enter this code:</div>
        <div class="user-code" id="user-code-value">--------</div>
        <div class="verification-uri">
          <span>at</span>
          <a href="#" id="verification-uri-link" target="_blank">-</a>
        </div>
      </div>
    `;
  }

  /**
   * Render the dialog modal (shared across all flows)
   * @returns {string} - HTML string
   */
  renderDialogModal() {
    return `
      <div class="modal-overlay" id="dialog-modal" hidden>
        <div class="modal modal-dialog">
          <div class="modal-header">
            <h3 id="dialog-title">Message</h3>
          </div>
          <div class="modal-body">
            <p id="dialog-message"></p>
            <input type="text" id="dialog-input" class="dialog-input" hidden>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-small" id="dialog-cancel" hidden>Cancel</button>
            <button class="btn btn-primary btn-small" id="dialog-ok">OK</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the configs list modal
   * @returns {string} - HTML string
   */
  renderConfigsModal() {
    return `
      <div class="modal-overlay" id="configs-modal" hidden>
        <div class="modal">
          <div class="modal-header">
            <h3>Saved Configurations</h3>
            <button class="btn-icon" id="close-modal-btn" title="Close">&times;</button>
          </div>
          <div class="modal-body" id="configs-list">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the step edit modal - comprehensive editor with all attributes
   * @returns {string} - HTML string
   */
  renderStepEditModal() {
    return `
      <div class="modal-overlay" id="step-edit-modal" hidden>
        <div class="modal modal-full">
          <div class="modal-header">
            <h3>Edit Step <span id="step-edit-number"></span></h3>
            <button class="btn-icon" id="close-step-edit-btn" title="Close">&times;</button>
          </div>
          <div class="modal-body step-edit-body">
            <!-- Tabs -->
            <div class="step-edit-tabs">
              <button class="step-edit-tab active" data-tab="basic">Basic</button>
              <button class="step-edit-tab" data-tab="button">Button</button>
              <button class="step-edit-tab" data-tab="endpoints">Endpoints</button>
              <button class="step-edit-tab" data-tab="curl">cURL</button>
              <button class="step-edit-tab" data-tab="api">API</button>
              <button class="step-edit-tab" data-tab="polling">Polling</button>
              <button class="step-edit-tab" data-tab="success">On Success</button>
              <button class="step-edit-tab" data-tab="subfunctions">Sub Functions</button>
            </div>

            <!-- Basic Tab -->
            <div class="step-edit-panel active" id="step-edit-panel-basic">
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-id">Step ID</label>
                  <input type="text" id="step-edit-id" placeholder="unique-step-id">
                </div>
                <div>
                  <label for="step-edit-title">Title</label>
                  <input type="text" id="step-edit-title" placeholder="Step title">
                </div>
              </div>
              <div class="config-row">
                <label for="step-edit-description">Description</label>
                <textarea id="step-edit-description" rows="3" placeholder="Step description"></textarea>
              </div>
              <div class="config-row config-row-triple">
                <div>
                  <label for="step-edit-actor">Actor</label>
                  <select id="step-edit-actor">
                    <option value="">None</option>
                    <option value="device">Device</option>
                    <option value="user">User</option>
                    <option value="agent">Agent</option>
                    <option value="server">Server</option>
                    <option value="app">App</option>
                  </select>
                </div>
                <div>
                  <label for="step-edit-actor-label">Actor Label</label>
                  <input type="text" id="step-edit-actor-label" placeholder="Display name">
                </div>
                <div>
                  <label for="step-edit-actor-icon">Actor Icon</label>
                  <select id="step-edit-actor-icon">
                    <option value="">Default</option>
                    <option value="tv">TV</option>
                    <option value="user">User</option>
                    <option value="server">Server</option>
                    <option value="key">Key</option>
                    <option value="lock">Lock</option>
                    <option value="link">Link</option>
                  </select>
                </div>
              </div>
              <div class="config-row">
                <label for="step-edit-info">Info Text <span class="label-optional">(optional)</span></label>
                <textarea id="step-edit-info" rows="2" placeholder="Additional info shown below description"></textarea>
              </div>
              <div class="config-row">
                <label>
                  <input type="checkbox" id="step-edit-locked">
                  Initially Locked
                </label>
              </div>
            </div>

            <!-- Button Tab -->
            <div class="step-edit-panel" id="step-edit-panel-button">
              <h4>Primary Button</h4>
              <div class="config-row">
                <label>
                  <input type="checkbox" id="step-edit-button-visible" checked>
                  Show Button
                </label>
              </div>
              <div class="config-row">
                <label>
                  <input type="checkbox" id="step-edit-button-show-as-qr">
                  Replace Button with QR Code
                </label>
                <small style="color: #666; margin-left: 1.5rem;">Uses the URL from "URL Source Expression" below</small>
              </div>
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-button-label">Button Label</label>
                  <input type="text" id="step-edit-button-label" placeholder="Button text">
                </div>
                <div>
                  <label for="step-edit-button-action">Action Type</label>
                  <select id="step-edit-button-action">
                    <option value="">None</option>
                    <option value="api">API Call</option>
                    <option value="openUrl">Open URL</option>
                    <option value="poll">Start Polling</option>
                    <option value="oauth">OAuth Popup</option>
                    <option value="subFunctions">Sub Functions</option>
                  </select>
                </div>
              </div>
              <div class="config-row" id="step-edit-url-source-row">
                <label for="step-edit-button-url-source">URL Source Expression</label>
                <input type="text" id="step-edit-button-url-source" placeholder="state.verificationUri || config.redirectUri">
              </div>

              <h4>Stop Button <span class="label-optional">(for polling steps)</span></h4>
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-stop-label">Stop Button Label</label>
                  <input type="text" id="step-edit-stop-label" placeholder="Stop Polling">
                </div>
                <div>
                  <label for="step-edit-stop-id">Stop Button ID</label>
                  <input type="text" id="step-edit-stop-id" placeholder="btn-stop-polling">
                </div>
              </div>

            </div>

            <!-- Endpoints Tab -->
            <div class="step-edit-panel" id="step-edit-panel-endpoints">
              <div class="panel-header">
                <h4>Endpoint Previews</h4>
                <button class="btn btn-small btn-secondary" id="step-edit-add-endpoint">+ Add Endpoint</button>
              </div>
              <div id="step-edit-endpoints-list" class="editable-list"></div>
            </div>

            <!-- cURL Tab -->
            <div class="step-edit-panel" id="step-edit-panel-curl">
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-curl-method">HTTP Method</label>
                  <select id="step-edit-curl-method">
                    <option value="">None (no cURL)</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label for="step-edit-curl-url">URL Template</label>
                  <input type="text" id="step-edit-curl-url" placeholder="{{oktaDomain}}{{basePath}}/token">
                </div>
              </div>

              <h4>Headers</h4>
              <div id="step-edit-curl-headers-list" class="editable-list"></div>
              <button class="btn btn-small btn-secondary" id="step-edit-add-curl-header">+ Add Header</button>

              <h4>Body Parameters</h4>
              <div id="step-edit-curl-body-list" class="editable-list"></div>
              <button class="btn btn-small btn-secondary" id="step-edit-add-curl-body">+ Add Parameter</button>

              <h4>Display Options</h4>
              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" id="step-edit-curl-show-as-url">
                  Show as URL only (hide full cURL command)
                </label>
              </div>
              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" id="step-edit-curl-show-as-qr">
                  Show QR code for URL
                </label>
              </div>
            </div>

            <!-- API Tab -->
            <div class="step-edit-panel" id="step-edit-panel-api">
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-api-endpoint">API Endpoint</label>
                  <input type="text" id="step-edit-api-endpoint" placeholder="/api/device/authorize">
                </div>
                <div>
                  <label for="step-edit-api-method">Method</label>
                  <select id="step-edit-api-method">
                    <option value="">None (no API call)</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>

              <h4>Store Results <span class="label-optional">(map response fields to state)</span></h4>
              <div id="step-edit-api-results-list" class="editable-list"></div>
              <button class="btn btn-small btn-secondary" id="step-edit-add-api-result">+ Add Mapping</button>
            </div>

            <!-- Polling Tab -->
            <div class="step-edit-panel" id="step-edit-panel-polling">
              <div class="config-row config-row-split">
                <div>
                  <label for="step-edit-poll-endpoint">Polling Endpoint</label>
                  <input type="text" id="step-edit-poll-endpoint" placeholder="/api/device/token">
                </div>
                <div>
                  <label for="step-edit-poll-method">Method</label>
                  <select id="step-edit-poll-method">
                    <option value="">None (no polling)</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </div>
              <div class="config-row">
                <label for="step-edit-poll-interval">Interval Source</label>
                <input type="text" id="step-edit-poll-interval" placeholder="state.pollingInterval">
              </div>

              <h4>Conditions</h4>
              <div class="config-row">
                <label for="step-edit-poll-success">Success Condition</label>
                <input type="text" id="step-edit-poll-success" placeholder="response.access_token">
              </div>
              <div class="config-row">
                <label for="step-edit-poll-pending">Pending Condition</label>
                <input type="text" id="step-edit-poll-pending" placeholder="response.error === 'authorization_pending'">
              </div>
              <div class="config-row">
                <label for="step-edit-poll-slowdown">Slow Down Condition</label>
                <input type="text" id="step-edit-poll-slowdown" placeholder="response.error === 'slow_down'">
              </div>
              <div class="config-row">
                <label for="step-edit-poll-expired">Expired Condition</label>
                <input type="text" id="step-edit-poll-expired" placeholder="response.error === 'expired_token'">
              </div>
              <div class="config-row">
                <label for="step-edit-poll-denied">Denied Condition</label>
                <input type="text" id="step-edit-poll-denied" placeholder="response.error === 'access_denied'">
              </div>

              <h4>Store Results on Success</h4>
              <div id="step-edit-poll-results-list" class="editable-list"></div>
              <button class="btn btn-small btn-secondary" id="step-edit-add-poll-result">+ Add Mapping</button>
            </div>

            <!-- On Success Tab -->
            <div class="step-edit-panel" id="step-edit-panel-success">
              <h4>Unlock Steps</h4>
              <div class="config-row">
                <label for="step-edit-unlock-steps">Steps to Unlock <span class="label-optional">(comma-separated numbers)</span></label>
                <input type="text" id="step-edit-unlock-steps" placeholder="2, 3">
              </div>

              <h4>UI Actions</h4>
              <div class="config-row">
                <label>
                  <input type="checkbox" id="step-edit-show-device-code">
                  Show Device Code Display
                </label>
              </div>
              <div class="config-row">
                <label>
                  <input type="checkbox" id="step-edit-show-token">
                  Show Token Display
                </label>
              </div>

              <h4>Result Display</h4>
              <div class="config-row">
                <label for="step-edit-result-type">Display Type</label>
                <select id="step-edit-result-type">
                  <option value="">Default (text)</option>
                  <option value="device-code-display">Device Code Display</option>
                  <option value="token-display">Token Display</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>

            <!-- Sub Functions Tab -->
            <div class="step-edit-panel" id="step-edit-panel-subfunctions">
              <div class="subfn-info">
                <p>Sub functions are reusable server-side operations that can be chained together.
                Set "Action Type" to "Sub Functions" on the Button tab to use these.</p>
              </div>

              <div class="panel-header">
                <h4>Function Chain</h4>
                <button class="btn btn-small btn-secondary" id="step-edit-add-subfn">+ Add Function</button>
              </div>

              <div id="step-edit-subfn-list" class="subfn-list"></div>

              <div class="subfn-help">
                <h4>Available Functions</h4>
                <div id="subfn-available-list" class="subfn-available">
                  <p class="loading">Loading available functions...</p>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-danger btn-small" id="step-edit-delete">Delete Step</button>
            <div class="modal-footer-right">
              <button class="btn btn-secondary btn-small" id="step-edit-cancel">Cancel</button>
              <button class="btn btn-primary btn-small" id="step-edit-save">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the stepper container with header
   * @returns {string} - HTML string
   */
  renderStepper() {
    const { name } = this.flow;

    return `
      <div class="stepper">
        <div class="stepper-header">
          <span>${escapeHtml(name)}</span>
          <div class="stepper-actions">
            <button id="export-flow-btn" class="btn btn-secondary btn-small" hidden title="Export flow definition">Export</button>
            <button id="view-logs-btn" class="btn btn-secondary btn-small">View Logs</button>
            <button id="reset-btn" class="btn btn-secondary btn-small">Reset</button>
            <label class="edit-toggle" title="Toggle edit mode">
              <input type="checkbox" id="edit-mode-toggle">
              <span class="edit-toggle-slider"></span>
              <span class="edit-toggle-label">Edit</span>
            </label>
          </div>
        </div>
        ${this.renderSteps()}
      </div>
    `;
  }

  /**
   * Render complete flow page
   * @returns {string} - HTML string
   */
  renderFullPage() {
    return `
      ${this.renderHeader()}

      <details class="config-panel" id="config-panel" open>
        <summary>
          Configuration <span class="config-status" id="config-status"></span>
          <button class="btn-icon" id="load-saved-btn" title="Load saved configuration">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H12.5A1.5 1.5 0 0114 5.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z"/></svg>
          </button>
        </summary>
        ${this.renderConfigPanel()}
      </details>

      ${this.renderDeviceCodeDisplay()}
      ${this.renderStepper()}
      ${this.renderTokenDisplay()}
      ${this.renderDialogModal()}
      ${this.renderConfigsModal()}
      ${this.renderStepEditModal()}
    `;
  }

  /**
   * Get icon SVG by name
   * @private
   */
  _getIcon(name) {
    const icons = {
      book: '📖',
      tv: '📺',
      user: '👤',
      server: '🖥️',
      key: '🔑',
      lock: '🔒',
      link: '🔗',
    };
    return icons[name] || '📄';
  }
}

/**
 * Create a flow renderer and render to a container
 * @param {object} flowDefinition - The flow definition
 * @param {HTMLElement|string} container - Container element or ID
 * @returns {FlowRenderer}
 */
export function renderFlow(flowDefinition, container) {
  const renderer = new FlowRenderer(flowDefinition);

  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (el) {
    el.innerHTML = renderer.renderFullPage();
  }

  return renderer;
}

export default FlowRenderer;
