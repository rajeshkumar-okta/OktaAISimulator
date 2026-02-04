/**
 * AuthServerPicker - Shared authorization server selection component
 *
 * Provides UI for selecting between:
 * - Org Authorization Server (oauth2/v1)
 * - Default Authorization Server (oauth2/default/v1)
 * - Custom Authorization Server (oauth2/{id}/v1)
 *
 * Usage:
 *   import { AuthServerPicker } from './lib/flow-engine/AuthServerPicker.js';
 *   const picker = new AuthServerPicker({
 *     modeSelectId: 'cfg-authServerMode',
 *     customInputId: 'cfg-authorizationServerId',
 *     previewId: 'auth-server-preview',
 *     onChange: (authServerId) => { updateCurlCommands(); }
 *   });
 *   picker.init();
 */

export class AuthServerPicker {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.modeSelectId - ID of mode select element
   * @param {string} options.customInputId - ID of custom auth server input
   * @param {string} options.previewId - ID of preview element
   * @param {Function} options.onChange - Callback when auth server changes
   */
  constructor(options) {
    this.modeSelectId = options.modeSelectId || 'cfg-authServerMode';
    this.customInputId = options.customInputId || 'cfg-authorizationServerId';
    this.previewId = options.previewId || 'auth-server-preview';
    this.onChange = options.onChange || (() => {});
  }

  /**
   * Initialize the auth server picker
   */
  init() {
    const modeSelect = document.getElementById(this.modeSelectId);
    const customInput = document.getElementById(this.customInputId);

    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        this._updateUI();
        this.onChange(this.getAuthServerId());
      });
    }

    if (customInput) {
      customInput.addEventListener('input', () => {
        this._updatePreview();
        this.onChange(this.getAuthServerId());
      });
    }

    this._updateUI();
  }

  /**
   * Update UI based on current mode
   * @private
   */
  _updateUI() {
    const modeSelect = document.getElementById(this.modeSelectId);
    const customInput = document.getElementById(this.customInputId);

    if (modeSelect && customInput) {
      const mode = modeSelect.value;
      customInput.hidden = mode !== 'custom';
    }

    this._updatePreview();
  }

  /**
   * Update the preview text
   * @private
   */
  _updatePreview() {
    const preview = document.getElementById(this.previewId);
    if (!preview) return;

    const authServerId = this.getAuthServerId();
    if (authServerId) {
      preview.textContent = `/oauth2/${authServerId}/v1/`;
    } else {
      preview.textContent = '/oauth2/v1/';
    }
  }

  /**
   * Get the current auth server ID
   * @returns {string} - Auth server ID or empty string for org server
   */
  getAuthServerId() {
    const modeSelect = document.getElementById(this.modeSelectId);
    if (!modeSelect) return '';

    const mode = modeSelect.value;
    if (mode === 'org') return '';
    if (mode === 'default') return 'default';

    // Custom mode
    const customInput = document.getElementById(this.customInputId);
    return customInput?.value?.trim() || '';
  }

  /**
   * Get the OAuth base path for the current selection
   * @returns {string} - OAuth path (e.g., 'oauth2/v1' or 'oauth2/default/v1')
   */
  getBasePath() {
    const authServerId = this.getAuthServerId();
    return authServerId ? `oauth2/${authServerId}/v1` : 'oauth2/v1';
  }

  /**
   * Get the current mode
   * @returns {string} - 'org', 'default', or 'custom'
   */
  getMode() {
    const modeSelect = document.getElementById(this.modeSelectId);
    return modeSelect?.value || 'org';
  }

  /**
   * Set the mode and optional custom ID
   * @param {string} mode - 'org', 'default', or 'custom'
   * @param {string} customId - Custom auth server ID (for 'custom' mode)
   */
  setMode(mode, customId = '') {
    const modeSelect = document.getElementById(this.modeSelectId);
    const customInput = document.getElementById(this.customInputId);

    if (modeSelect) {
      modeSelect.value = mode;
    }

    if (customInput && mode === 'custom') {
      customInput.value = customId;
    }

    this._updateUI();
  }

  /**
   * Set from an auth server ID (determines mode automatically)
   * @param {string} authServerId - Auth server ID
   */
  setFromAuthServerId(authServerId) {
    if (!authServerId) {
      this.setMode('org');
    } else if (authServerId === 'default') {
      this.setMode('default');
    } else {
      this.setMode('custom', authServerId);
    }
  }
}

/**
 * Step-specific auth server picker for flows with multiple auth server selections
 * (e.g., agentic flow where steps can use different auth servers)
 */
export class StepAuthServerPicker {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.selectId - ID of the step's auth server select
   * @param {string} options.alternateInputId - ID of alternate server input (optional)
   * @param {string} options.customAuthServerId - The configured custom auth server ID
   * @param {Function} options.onChange - Callback when selection changes
   */
  constructor(options) {
    this.selectId = options.selectId;
    this.alternateInputId = options.alternateInputId;
    this.customAuthServerId = options.customAuthServerId || '';
    this.onChange = options.onChange || (() => {});
  }

  /**
   * Initialize the step auth server picker
   */
  init() {
    const select = document.getElementById(this.selectId);
    const alternateInput = this.alternateInputId ? document.getElementById(this.alternateInputId) : null;

    if (select) {
      select.addEventListener('change', () => {
        this._updateUI();
        this._updateOptionLabels();
        this.onChange(this.getAuthServerId(), this.getBasePath());
      });
    }

    if (alternateInput) {
      alternateInput.addEventListener('input', () => {
        this._updateAlternateLabel();
        this.onChange(this.getAuthServerId(), this.getBasePath());
      });
    }

    this._updateUI();
    this._updateOptionLabels();
  }

  /**
   * Update the custom auth server ID (from config)
   * @param {string} id - Custom auth server ID
   */
  setCustomAuthServerId(id) {
    this.customAuthServerId = id || '';
    this._updateOptionLabels();
  }

  /**
   * Update UI visibility
   * @private
   */
  _updateUI() {
    const select = document.getElementById(this.selectId);
    const alternateInput = this.alternateInputId ? document.getElementById(this.alternateInputId) : null;

    if (select && alternateInput) {
      alternateInput.hidden = select.value !== 'alternate';
    }
  }

  /**
   * Update option labels to show current IDs
   * @private
   */
  _updateOptionLabels() {
    const select = document.getElementById(this.selectId);
    if (!select) return;

    const customOption = select.querySelector('option[value="custom"]');
    if (customOption) {
      const displayId = this.customAuthServerId || '{custom}';
      customOption.textContent = `oauth2/${displayId}/v1`;
    }
  }

  /**
   * Update alternate option label
   * @private
   */
  _updateAlternateLabel() {
    const select = document.getElementById(this.selectId);
    const alternateInput = this.alternateInputId ? document.getElementById(this.alternateInputId) : null;

    if (!select) return;

    const alternateOption = select.querySelector('option[value="alternate"]');
    if (alternateOption && alternateInput) {
      const displayId = alternateInput.value.trim() || '{alternate}';
      alternateOption.textContent = `oauth2/${displayId}/v1`;
    }
  }

  /**
   * Get the selected auth server ID
   * @returns {string}
   */
  getAuthServerId() {
    const select = document.getElementById(this.selectId);
    if (!select) return '';

    const mode = select.value;
    if (mode === 'org') return '';
    if (mode === 'default') return 'default';
    if (mode === 'alternate') {
      const alternateInput = this.alternateInputId ? document.getElementById(this.alternateInputId) : null;
      return alternateInput?.value?.trim() || '';
    }
    // 'custom'
    return this.customAuthServerId;
  }

  /**
   * Get the OAuth base path
   * @returns {string}
   */
  getBasePath() {
    const authServerId = this.getAuthServerId();
    return authServerId ? `oauth2/${authServerId}/v1` : 'oauth2/v1';
  }

  /**
   * Get the current mode
   * @returns {string}
   */
  getMode() {
    const select = document.getElementById(this.selectId);
    return select?.value || 'org';
  }
}

/**
 * Create standalone auth server picker functions
 * @param {object} options - Same as AuthServerPicker constructor
 * @returns {object} - Auth server picker functions
 */
export function createAuthServerPickerFunctions(options) {
  const picker = new AuthServerPicker(options);

  return {
    init: () => picker.init(),
    getAuthServerId: () => picker.getAuthServerId(),
    getBasePath: () => picker.getBasePath(),
    getMode: () => picker.getMode(),
    setMode: (mode, customId) => picker.setMode(mode, customId),
    setFromAuthServerId: (id) => picker.setFromAuthServerId(id),
  };
}

/**
 * Setup Okta domain auto-correct (removes -admin from admin URLs)
 * @param {string} inputId - ID of the Okta domain input field
 * @param {Function} onChange - Callback when domain changes
 */
export function setupOktaDomainAutoCorrect(inputId, onChange = () => {}) {
  const input = document.getElementById(inputId);
  if (!input) return;

  function autoCorrect() {
    const value = input.value;
    const corrected = value.replace(/-admin\.(okta|oktapreview|okta-emea|okta-gov)/gi, '.$1');

    if (corrected !== value) {
      input.value = corrected;
      // Visual feedback
      input.style.backgroundColor = '#d1fae5';
      setTimeout(() => {
        input.style.backgroundColor = '';
      }, 1000);
      onChange(corrected);
    }
  }

  function ensureHttps() {
    let val = input.value.trim();
    if (val && !val.startsWith('http')) {
      val = 'https://' + val;
    }
    val = val.replace(/\/+$/, '');
    input.value = val;
    onChange(val);
  }

  input.addEventListener('input', autoCorrect);
  input.addEventListener('paste', () => setTimeout(autoCorrect, 0));
  input.addEventListener('blur', ensureHttps);
}

// Default export
export default AuthServerPicker;
