/**
 * ScopeSelector - Shared OAuth scope selector component
 *
 * Provides a tile-based scope selection UI with:
 * - Fetching scopes from authorization server well-known endpoint
 * - Standard scope identification and sorting
 * - Custom scope addition
 * - Debounced fetching
 *
 * Usage:
 *   import { ScopeSelector } from './lib/flow-engine/ScopeSelector.js';
 *   const scopeSelector = new ScopeSelector({
 *     tilesContainerId: 'scope-tiles',
 *     loadingElementId: 'scope-loading',
 *     customInputId: 'scope-custom-input',
 *     addButtonId: 'scope-add-btn',
 *     hiddenInputId: 'cfg-scopes',
 *     getOktaDomain: () => document.getElementById('cfg-oktaDomain').value,
 *     getAuthServerId: () => getAuthServerId()
 *   });
 *   scopeSelector.init();
 */

import { escapeHtml, escapeAttr } from './CurlGenerator.js';

// Standard OAuth/OIDC scopes
const DEFAULT_STANDARD_SCOPES = new Set([
  'openid',
  'profile',
  'email',
  'address',
  'phone',
  'offline_access',
  'device_sso',
  'interclient_access'
]);

// Fallback scopes when server fetch fails
const DEFAULT_FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'];

export class ScopeSelector {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.tilesContainerId - ID of scope tiles container
   * @param {string} options.loadingElementId - ID of loading message element
   * @param {string} options.customInputId - ID of custom scope input field
   * @param {string} options.addButtonId - ID of add custom scope button
   * @param {string} options.hiddenInputId - ID of hidden input storing selected scopes
   * @param {Function} options.getOktaDomain - Function returning current Okta domain
   * @param {Function} options.getAuthServerId - Function returning current auth server ID
   * @param {Function} options.onChange - Callback when selection changes
   * @param {Set} options.standardScopes - Set of standard scope names
   * @param {Array} options.fallbackScopes - Fallback scopes when fetch fails
   * @param {Set} options.initialSelection - Initial selected scopes
   * @param {number} options.debounceMs - Debounce delay for fetching (default: 500)
   */
  constructor(options) {
    this.tilesContainerId = options.tilesContainerId || 'scope-tiles';
    this.loadingElementId = options.loadingElementId || 'scope-loading';
    this.customInputId = options.customInputId || 'scope-custom-input';
    this.addButtonId = options.addButtonId || 'scope-add-btn';
    this.hiddenInputId = options.hiddenInputId || 'cfg-scopes';
    this.getOktaDomain = options.getOktaDomain || (() => '');
    this.getAuthServerId = options.getAuthServerId || (() => '');
    this.onChange = options.onChange || (() => {});
    this.standardScopes = options.standardScopes || DEFAULT_STANDARD_SCOPES;
    this.fallbackScopes = options.fallbackScopes || DEFAULT_FALLBACK_SCOPES;
    this.debounceMs = options.debounceMs || 500;

    // State
    this.availableScopes = [];
    this.selectedScopes = options.initialSelection || new Set(['openid', 'profile', 'email', 'offline_access']);
    this.customScopes = new Set();
    this.fetchTimeout = null;
  }

  /**
   * Initialize the scope selector
   */
  init() {
    this._bindEventListeners();
    this.render();
  }

  /**
   * Bind event listeners
   * @private
   */
  _bindEventListeners() {
    const addBtn = document.getElementById(this.addButtonId);
    const customInput = document.getElementById(this.customInputId);

    if (addBtn) {
      addBtn.addEventListener('click', () => this.addCustomScope());
    }

    if (customInput) {
      customInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addCustomScope();
        }
      });
    }
  }

  /**
   * Check if a scope is standard
   * @param {string} scope - Scope name
   * @returns {boolean}
   */
  isStandardScope(scope) {
    return this.standardScopes.has(scope);
  }

  /**
   * Trigger debounced fetch of available scopes
   */
  debouncedFetch() {
    clearTimeout(this.fetchTimeout);
    this.fetchTimeout = setTimeout(() => this.fetchScopes(), this.debounceMs);
  }

  /**
   * Fetch available scopes from authorization server
   * @returns {Promise<void>}
   */
  async fetchScopes() {
    const oktaDomain = this.getOktaDomain();
    const authServerId = this.getAuthServerId();
    const loadingEl = document.getElementById(this.loadingElementId);

    if (!oktaDomain) {
      if (loadingEl) {
        loadingEl.textContent = 'Configure Okta Domain to load scopes';
        loadingEl.style.display = '';
      }
      this.availableScopes = [...this.fallbackScopes];
      this.render();
      return;
    }

    if (!authServerId) {
      // Org authorization server - use fallback scopes
      if (loadingEl) {
        loadingEl.textContent = '';
        loadingEl.style.display = 'none';
      }
      this.availableScopes = [...this.fallbackScopes];
      this.render();
      return;
    }

    if (loadingEl) {
      loadingEl.textContent = 'Loading scopes...';
      loadingEl.style.display = '';
    }

    try {
      const wellKnownUrl = `${oktaDomain}/oauth2/${authServerId}/.well-known/oauth-authorization-server`;
      const response = await fetch(wellKnownUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.availableScopes = data.scopes_supported || [...this.fallbackScopes];

      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
    } catch (err) {
      console.log('Could not fetch scopes:', err.message);
      if (loadingEl) {
        loadingEl.textContent = 'Could not load scopes from authorization server';
        loadingEl.style.display = '';
      }
      this.availableScopes = [...this.fallbackScopes];
    }

    this.render();
  }

  /**
   * Render the scope tiles
   */
  render() {
    const container = document.getElementById(this.tilesContainerId);
    const loadingEl = document.getElementById(this.loadingElementId);
    if (!container) return;

    // Combine all scopes
    const allScopes = [...new Set([
      ...this.fallbackScopes,
      ...this.availableScopes,
      ...this.customScopes
    ])];

    // Sort: custom first, then server (non-standard), then standard
    const sorted = allScopes.sort((a, b) => {
      const aCustom = this.customScopes.has(a);
      const bCustom = this.customScopes.has(b);
      const aStandard = this.isStandardScope(a);
      const bStandard = this.isStandardScope(b);

      if (aCustom && !bCustom) return -1;
      if (!aCustom && bCustom) return 1;
      if (!aStandard && bStandard) return -1;
      if (aStandard && !bStandard) return 1;
      return a.localeCompare(b);
    });

    // Build tiles HTML
    let tilesHtml = '';
    for (const scope of sorted) {
      const isSelected = this.selectedScopes.has(scope);
      const isCustom = this.customScopes.has(scope);
      const isStandard = this.isStandardScope(scope);

      let className = 'scope-tile';
      if (isCustom) {
        className += ' custom';
      } else if (isSelected) {
        className += ' selected';
      } else {
        className += ' available';
        if (isStandard) className += ' standard';
      }

      const removeBtn = isCustom ? '<span class="scope-remove">&times;</span>' : '';
      tilesHtml += `<span class="${className}" data-scope="${escapeAttr(scope)}">${escapeHtml(scope)}${removeBtn}</span>`;
    }

    // Clear container and rebuild
    container.innerHTML = '';

    // Add loading element back if it exists
    if (loadingEl) {
      container.appendChild(loadingEl);
      loadingEl.style.display = tilesHtml ? 'none' : '';
    }

    // Add scope tiles
    if (tilesHtml) {
      const tilesWrapper = document.createElement('span');
      tilesWrapper.innerHTML = tilesHtml;
      while (tilesWrapper.firstChild) {
        container.appendChild(tilesWrapper.firstChild);
      }
    }

    // Bind click handlers to tiles
    container.querySelectorAll('.scope-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        const scope = tile.dataset.scope;
        const isCustom = this.customScopes.has(scope);

        if (isCustom && e.target.classList.contains('scope-remove')) {
          this.removeCustomScope(scope);
        } else {
          this.toggleScope(scope);
        }
      });
    });

    this._updateHiddenInput();
    this.onChange(this.getSelectedScopes());
  }

  /**
   * Toggle a scope selection
   * @param {string} scope - Scope to toggle
   */
  toggleScope(scope) {
    if (this.selectedScopes.has(scope)) {
      this.selectedScopes.delete(scope);
    } else {
      this.selectedScopes.add(scope);
    }
    this.render();
  }

  /**
   * Add a custom scope
   * @param {string} scope - Optional scope name (reads from input if not provided)
   */
  addCustomScope(scope = null) {
    if (!scope) {
      const input = document.getElementById(this.customInputId);
      scope = input?.value?.trim();
      if (input) input.value = '';
    }

    if (!scope) return;

    // If it's already an available scope, just select it
    if (this.availableScopes.includes(scope)) {
      this.selectedScopes.add(scope);
    } else if (!this.customScopes.has(scope)) {
      // Add as new custom scope
      this.customScopes.add(scope);
      this.selectedScopes.add(scope);
    }

    this.render();
  }

  /**
   * Remove a custom scope
   * @param {string} scope - Scope to remove
   */
  removeCustomScope(scope) {
    this.customScopes.delete(scope);
    this.selectedScopes.delete(scope);
    this.render();
  }

  /**
   * Update the hidden input with selected scopes
   * @private
   */
  _updateHiddenInput() {
    const hidden = document.getElementById(this.hiddenInputId);
    if (hidden) {
      hidden.value = Array.from(this.selectedScopes).join(' ');
    }
  }

  /**
   * Get selected scopes as array
   * @returns {Array<string>}
   */
  getSelectedScopes() {
    return Array.from(this.selectedScopes);
  }

  /**
   * Get selected scopes as space-separated string
   * @returns {string}
   */
  getSelectedScopesString() {
    return Array.from(this.selectedScopes).join(' ');
  }

  /**
   * Set selected scopes
   * @param {Array<string>|Set<string>|string} scopes - Scopes to select
   */
  setSelectedScopes(scopes) {
    if (typeof scopes === 'string') {
      scopes = scopes.split(/\s+/).filter(s => s);
    }
    this.selectedScopes = new Set(scopes);
    this.render();
  }

  /**
   * Get custom scopes
   * @returns {Array<string>}
   */
  getCustomScopes() {
    return Array.from(this.customScopes);
  }

  /**
   * Set custom scopes
   * @param {Array<string>|Set<string>} scopes - Custom scopes
   */
  setCustomScopes(scopes) {
    this.customScopes = new Set(scopes);
    this.render();
  }

  /**
   * Restore state from saved configuration
   * @param {string} scopeString - Space-separated selected scopes
   * @param {Array<string>} customScopesList - List of custom scopes
   */
  restoreFromConfig(scopeString, customScopesList = []) {
    if (scopeString) {
      this.selectedScopes = new Set(scopeString.split(/\s+/).filter(s => s));
    } else {
      this.selectedScopes = new Set();
    }
    this.customScopes = new Set(customScopesList);
    this.render();
  }

  /**
   * Clear all selections and custom scopes
   */
  clear() {
    this.selectedScopes = new Set();
    this.customScopes = new Set();
    this.availableScopes = [];
    this.render();
  }
}

/**
 * Create standalone scope selector functions
 * @param {object} options - Same as ScopeSelector constructor
 * @returns {object} - Scope selector functions
 */
export function createScopeSelectorFunctions(options) {
  const selector = new ScopeSelector(options);

  return {
    init: () => selector.init(),
    fetchScopes: () => selector.fetchScopes(),
    debouncedFetch: () => selector.debouncedFetch(),
    render: () => selector.render(),
    toggleScope: (scope) => selector.toggleScope(scope),
    addCustomScope: (scope) => selector.addCustomScope(scope),
    removeCustomScope: (scope) => selector.removeCustomScope(scope),
    getSelectedScopes: () => selector.getSelectedScopes(),
    getSelectedScopesString: () => selector.getSelectedScopesString(),
    setSelectedScopes: (scopes) => selector.setSelectedScopes(scopes),
    getCustomScopes: () => selector.getCustomScopes(),
    setCustomScopes: (scopes) => selector.setCustomScopes(scopes),
    restoreFromConfig: (scopeString, customScopes) => selector.restoreFromConfig(scopeString, customScopes),
    clear: () => selector.clear(),
  };
}

// Default export
export default ScopeSelector;
