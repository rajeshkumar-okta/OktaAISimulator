/**
 * ExpressionAutocomplete - Provides autocomplete for template expressions
 *
 * Shows a dropdown when user types "{{" in expression fields, allowing them
 * to select from available variables like config.clientId, state.deviceCode, etc.
 *
 * Usage:
 *   import { ExpressionAutocomplete } from './ExpressionAutocomplete.js';
 *   const autocomplete = new ExpressionAutocomplete(flow);
 *   autocomplete.attach(inputElement);
 */

export class ExpressionAutocomplete {
  /**
   * @param {object} flow - The flow definition (for extracting config fields and state schema)
   */
  constructor(flow) {
    this.flow = flow;
    this.dropdown = null;
    this.activeInput = null;
    this.variables = this._buildVariableList();
    this.filteredVariables = [];
    this.selectedIndex = 0;
    this.triggerStart = -1;

    this._createDropdown();
    this._bindGlobalEvents();
  }

  /**
   * Build the list of available variables from the flow definition
   * @private
   */
  _buildVariableList() {
    const variables = [];

    // Built-in variables
    variables.push({
      name: 'basePath',
      category: 'Built-in',
      description: 'OAuth base path (e.g., oauth2/default/v1)',
      example: '{{basePath}}'
    });

    variables.push({
      name: 'oktaDomain',
      category: 'Built-in',
      description: 'Okta domain URL',
      example: '{{oktaDomain}}'
    });

    // Config fields from flow definition
    if (this.flow?.configFields) {
      for (const field of this.flow.configFields) {
        variables.push({
          name: `config.${field.id}`,
          category: 'Config',
          description: field.label || field.id,
          example: `{{config.${field.id}}}`
        });
      }
    }

    // Common config fields (fallback if not in flow)
    const commonConfigFields = [
      { id: 'oktaDomain', label: 'Okta Domain' },
      { id: 'clientId', label: 'Client ID' },
      { id: 'clientSecret', label: 'Client Secret' },
      { id: 'redirectUri', label: 'Redirect URI' },
      { id: 'scopes', label: 'Scopes' },
      { id: 'responseType', label: 'Response Type' },
      { id: 'authorizationServerId', label: 'Auth Server ID' },
    ];

    for (const field of commonConfigFields) {
      const exists = variables.some(v => v.name === `config.${field.id}`);
      if (!exists) {
        variables.push({
          name: `config.${field.id}`,
          category: 'Config',
          description: field.label,
          example: `{{config.${field.id}}}`
        });
      }
    }

    // State fields from flow definition
    if (this.flow?.stateSchema) {
      for (const [key, schema] of Object.entries(this.flow.stateSchema)) {
        variables.push({
          name: `state.${key}`,
          category: 'State',
          description: schema.description || key,
          example: `{{state.${key}}}`
        });
      }
    }

    // Common state fields (for flows that might use them)
    const commonStateFields = [
      { id: 'deviceCode', label: 'Device Code' },
      { id: 'userCode', label: 'User Code' },
      { id: 'verificationUri', label: 'Verification URI' },
      { id: 'verificationUriComplete', label: 'Verification URI Complete' },
      { id: 'pollingInterval', label: 'Polling Interval' },
      { id: 'accessToken', label: 'Access Token' },
      { id: 'idToken', label: 'ID Token' },
      { id: 'refreshToken', label: 'Refresh Token' },
      { id: 'authorizationCode', label: 'Authorization Code' },
    ];

    for (const field of commonStateFields) {
      const exists = variables.some(v => v.name === `state.${field.id}`);
      if (!exists) {
        variables.push({
          name: `state.${field.id}`,
          category: 'State',
          description: field.label,
          example: `{{state.${field.id}}}`
        });
      }
    }

    // Response fields (for conditions)
    const responseFields = [
      { id: 'access_token', label: 'Access Token' },
      { id: 'id_token', label: 'ID Token' },
      { id: 'refresh_token', label: 'Refresh Token' },
      { id: 'error', label: 'Error Code' },
      { id: 'error_description', label: 'Error Description' },
    ];

    for (const field of responseFields) {
      variables.push({
        name: `response.${field.id}`,
        category: 'Response',
        description: field.label,
        example: `response.${field.id}`
      });
    }

    // Sub-function outputs (for chaining sub-functions within a step)
    // These are available when using button.action: 'subFunctions'
    // Format: subFn.<functionId>.<outputName>
    const subFnOutputs = [
      // createJwtAssertion outputs
      { fn: 'clientAuth', output: 'assertion', label: 'JWT Assertion' },
      { fn: 'clientAuth', output: 'algorithm', label: 'Algorithm Used' },
      { fn: 'clientAuth', output: 'kid', label: 'Key ID' },
      { fn: 'clientAuth', output: 'expiresAt', label: 'Expiration Time' },
      // tokenExchange outputs
      { fn: 'exchange', output: 'access_token', label: 'Access Token' },
      { fn: 'exchange', output: 'token_type', label: 'Token Type' },
      { fn: 'exchange', output: 'expires_in', label: 'Expires In' },
      { fn: 'exchange', output: 'issued_token_type', label: 'Issued Token Type' },
      // decodeJwt outputs
      { fn: 'decoded', output: 'header', label: 'JWT Header' },
      { fn: 'decoded', output: 'payload', label: 'JWT Payload' },
      { fn: 'decoded', output: 'issuer', label: 'Issuer Claim' },
      { fn: 'decoded', output: 'subject', label: 'Subject Claim' },
      { fn: 'decoded', output: 'isExpired', label: 'Is Expired' },
      // httpRequest outputs
      { fn: 'apiCall', output: 'status', label: 'HTTP Status Code' },
      { fn: 'apiCall', output: 'body', label: 'Response Body' },
      { fn: 'apiCall', output: 'ok', label: 'Request OK' },
    ];

    for (const item of subFnOutputs) {
      variables.push({
        name: `subFn.${item.fn}.${item.output}`,
        category: 'Sub Function',
        description: `${item.label} (from ${item.fn})`,
        example: `{{subFn.${item.fn}.${item.output}}}`
      });
    }

    return variables;
  }

  /**
   * Create the dropdown element
   * @private
   */
  _createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'expression-autocomplete-dropdown';
    this.dropdown.hidden = true;
    document.body.appendChild(this.dropdown);
  }

  /**
   * Bind global events for closing dropdown
   * @private
   */
  _bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      if (!this.dropdown.contains(e.target) && e.target !== this.activeInput) {
        this.hide();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.dropdown.hidden) {
        if (e.key === 'Escape') {
          this.hide();
          e.preventDefault();
        }
      }
    });
  }

  /**
   * Attach autocomplete to an input element
   * @param {HTMLInputElement|HTMLTextAreaElement} input
   */
  attach(input) {
    if (!input) return;

    input.addEventListener('input', (e) => this._onInput(e));
    input.addEventListener('keydown', (e) => this._onKeyDown(e));
    input.addEventListener('blur', () => {
      // Delay hide to allow click on dropdown
      setTimeout(() => this.hide(), 150);
    });
  }

  /**
   * Attach to all expression fields in the step edit modal
   */
  attachToStepEditModal() {
    const expressionFields = [
      'step-edit-curl-url',
      'step-edit-button-url-source',
      'step-edit-api-endpoint',
      'step-edit-poll-endpoint',
      'step-edit-poll-interval',
      'step-edit-poll-success',
      'step-edit-poll-pending',
      'step-edit-poll-slowdown',
      'step-edit-poll-expired',
      'step-edit-poll-denied',
    ];

    for (const id of expressionFields) {
      const el = document.getElementById(id);
      if (el) {
        this.attach(el);
      }
    }

    // Also attach to dynamically created inputs in editable lists
    this._attachToEditableLists();
  }

  /**
   * Attach to editable list inputs
   * @private
   */
  _attachToEditableLists() {
    // Use mutation observer to attach to dynamically added inputs
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const inputs = node.querySelectorAll ?
              node.querySelectorAll('.editable-list-item input[data-field="value"], .editable-list-item input[data-field="source"], .editable-list-item input[data-field="template"]') :
              [];
            for (const input of inputs) {
              this.attach(input);
            }
          }
        }
      }
    });

    const modal = document.getElementById('step-edit-modal');
    if (modal) {
      observer.observe(modal, { childList: true, subtree: true });
    }

    // Also attach to existing inputs
    const existingInputs = document.querySelectorAll('.editable-list-item input[data-field="value"], .editable-list-item input[data-field="source"], .editable-list-item input[data-field="template"]');
    for (const input of existingInputs) {
      this.attach(input);
    }
  }

  /**
   * Handle input event
   * @private
   */
  _onInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find if we're in a {{ context
    const beforeCursor = value.substring(0, cursorPos);
    const triggerMatch = beforeCursor.match(/\{\{([^{}]*)$/);

    if (triggerMatch) {
      this.activeInput = input;
      this.triggerStart = cursorPos - triggerMatch[1].length - 2; // Position of "{{"
      const searchTerm = triggerMatch[1].toLowerCase();

      this.filteredVariables = this.variables.filter(v =>
        v.name.toLowerCase().includes(searchTerm) ||
        v.description.toLowerCase().includes(searchTerm)
      );

      if (this.filteredVariables.length > 0) {
        this.selectedIndex = 0;
        this._renderDropdown();
        this._positionDropdown(input);
        this.dropdown.hidden = false;
      } else {
        this.hide();
      }
    } else {
      this.hide();
    }
  }

  /**
   * Handle keydown for navigation
   * @private
   */
  _onKeyDown(e) {
    if (this.dropdown.hidden) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredVariables.length - 1);
        this._updateSelection();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this._updateSelection();
        break;

      case 'Enter':
      case 'Tab':
        if (this.filteredVariables.length > 0) {
          e.preventDefault();
          this._selectVariable(this.filteredVariables[this.selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.hide();
        break;
    }
  }

  /**
   * Render the dropdown content
   * @private
   */
  _renderDropdown() {
    // Group by category
    const grouped = {};
    for (const v of this.filteredVariables) {
      if (!grouped[v.category]) {
        grouped[v.category] = [];
      }
      grouped[v.category].push(v);
    }

    let html = '';
    let index = 0;

    for (const [category, vars] of Object.entries(grouped)) {
      html += `<div class="autocomplete-category">${escapeHtml(category)}</div>`;
      for (const v of vars) {
        const selected = index === this.selectedIndex ? 'selected' : '';
        html += `
          <div class="autocomplete-item ${selected}" data-index="${index}">
            <span class="autocomplete-name">${escapeHtml(v.name)}</span>
            <span class="autocomplete-desc">${escapeHtml(v.description)}</span>
          </div>
        `;
        index++;
      }
    }

    this.dropdown.innerHTML = html;

    // Bind click events
    this.dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        this._selectVariable(this.filteredVariables[idx]);
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = parseInt(item.dataset.index, 10);
        this._updateSelection();
      });
    });
  }

  /**
   * Update visual selection
   * @private
   */
  _updateSelection() {
    this.dropdown.querySelectorAll('.autocomplete-item').forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
    });

    // Scroll into view
    const selectedEl = this.dropdown.querySelector('.autocomplete-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Position dropdown below input
   * @private
   */
  _positionDropdown(input) {
    const rect = input.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    this.dropdown.style.top = `${rect.bottom + scrollTop + 2}px`;
    this.dropdown.style.left = `${rect.left + scrollLeft}px`;
    this.dropdown.style.minWidth = `${rect.width}px`;
  }

  /**
   * Select a variable and insert it
   * @private
   */
  _selectVariable(variable) {
    if (!this.activeInput || !variable) return;

    const input = this.activeInput;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find the "{{" and what comes after cursor
    const beforeTrigger = value.substring(0, this.triggerStart);
    const afterCursor = value.substring(cursorPos);

    // Check if there's already a closing "}}" - if so, just insert the variable name
    const hasClosing = afterCursor.startsWith('}}');
    const insertion = hasClosing ? variable.name : `{{${variable.name}}}`;
    const insertionOffset = hasClosing ? 0 : 2; // Account for "{{"

    // Build new value
    const newValue = beforeTrigger + insertion + (hasClosing ? afterCursor : afterCursor);
    input.value = newValue;

    // Position cursor after the inserted variable
    const newCursorPos = beforeTrigger.length + insertion.length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();

    // Trigger input event for any listeners
    input.dispatchEvent(new Event('input', { bubbles: true }));

    this.hide();
  }

  /**
   * Hide the dropdown
   */
  hide() {
    this.dropdown.hidden = true;
    this.activeInput = null;
    this.triggerStart = -1;
  }

  /**
   * Update the flow definition (e.g., after loading a new flow)
   * @param {object} flow
   */
  updateFlow(flow) {
    this.flow = flow;
    this.variables = this._buildVariableList();
  }

  /**
   * Destroy the autocomplete instance
   */
  destroy() {
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
  }
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default ExpressionAutocomplete;
