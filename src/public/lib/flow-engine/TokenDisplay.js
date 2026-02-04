/**
 * TokenDisplay - Shared token display and copy utilities
 *
 * Provides functionality for displaying, decoding, and copying OAuth tokens.
 *
 * Usage:
 *   import { TokenDisplay } from './lib/flow-engine/TokenDisplay.js';
 *   const tokenDisplay = new TokenDisplay(tokens);
 *   tokenDisplay.bindCopyButtons(container, 'display-area-id');
 */

import { escapeHtml } from './CurlGenerator.js';

/**
 * Format JSON with syntax highlighting for claims
 * @param {object} obj - Object to format
 * @returns {string} - HTML-formatted JSON
 */
export function formatJson(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/"([^"]+)":\s*"([^"]*?)"/g, (match, key, val) => {
      return `"<span class="claim-key">${escapeHtml(key)}</span>": "<span class="claim-value">${escapeHtml(val)}</span>"`;
    })
    .replace(/"([^"]+)":\s*(\d+)/g, (match, key, val) => {
      return `"<span class="claim-key">${escapeHtml(key)}</span>": ${val}`;
    })
    .replace(/"([^"]+)":\s*(true|false|null)/g, (match, key, val) => {
      return `"<span class="claim-key">${escapeHtml(key)}</span>": ${val}`;
    });
}

/**
 * Decode a JWT token for display
 * @param {string} token - JWT token string
 * @param {string} tokenType - Type label (for display in opaque token case)
 * @returns {object} - Decoded payload or info object for opaque tokens
 */
export function decodeTokenForDisplay(token, tokenType) {
  try {
    // Try to decode as JWT (base64url encoded parts separated by dots)
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload;
    }
  } catch {
    // Not a valid JWT
  }
  // Return info for opaque tokens
  return {
    _note: `This ${tokenType} appears to be an opaque token`,
    token_preview: token.substring(0, 50) + '...',
    token_length: token.length
  };
}

/**
 * Decode a full JWT including header
 * @param {string} token - JWT token string
 * @returns {object|null} - { header, payload } or null if not a valid JWT
 */
export function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { header, payload, signature: parts[2] };
    }
  } catch {
    // Not a valid JWT
  }
  return null;
}

/**
 * Build HTML for token copy buttons
 * @param {Array} items - Array of { label, key, token } objects
 * @param {boolean} showLabel - Whether to show "Success!" label
 * @returns {string} - HTML string for token copy bar
 */
export function buildTokenCopyButtons(items, showLabel = false) {
  const available = items.filter(item => item.token);
  if (!available.length) return '';

  const label = showLabel
    ? '<span class="token-copy-label"><span class="success-indicator">Success!</span> display and copy to clipboard:</span>'
    : '';

  const buttons = available.map(item =>
    `<button class="btn-copy-token" data-token-key="${escapeHtml(item.key)}" title="Copy ${escapeHtml(item.label)} to clipboard">${escapeHtml(item.label)}</button>`
  ).join('');

  return `<div class="token-copy-bar">${label}${buttons}</div>`;
}

export class TokenDisplay {
  /**
   * @param {object} tokens - Token storage object (will be read for values)
   */
  constructor(tokens) {
    this.tokens = tokens;
  }

  /**
   * Copy token to clipboard
   * @param {string} token - Token value to copy
   * @returns {Promise<void>}
   */
  async copyToClipboard(token) {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = token;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  /**
   * Bind copy button click handlers (simple copy only)
   * @param {HTMLElement} container - Container with copy buttons
   */
  bindCopyButtons(container) {
    container.querySelectorAll('.btn-copy-token').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.tokenKey;
        const token = this.tokens[key];
        if (!token) return;

        await this.copyToClipboard(token);

        // Show copied feedback
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  /**
   * Bind copy buttons with toggle display functionality
   * @param {HTMLElement} container - Container with copy buttons
   * @param {string} displayAreaId - ID of the display area element
   */
  bindCopyButtonsWithDisplay(container, displayAreaId) {
    const displayArea = document.getElementById(displayAreaId);
    let currentlyDisplayedKey = null;

    container.querySelectorAll('.btn-copy-token').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.tokenKey;
        const token = this.tokens[key];
        if (!token) return;

        // Copy to clipboard
        await this.copyToClipboard(token);

        // Show copied feedback
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('copied');
        }, 1500);

        // Toggle display of token JSON
        if (currentlyDisplayedKey === key) {
          // Hide if same button clicked again
          displayArea.hidden = true;
          displayArea.innerHTML = '';
          currentlyDisplayedKey = null;
          // Remove active state from all buttons
          container.querySelectorAll('.btn-copy-token').forEach(b => b.classList.remove('active'));
        } else {
          // Decode and display the token
          const decoded = decodeTokenForDisplay(token, key);
          displayArea.innerHTML = `<div class="result-box">${formatJson(decoded)}</div>`;
          displayArea.hidden = false;
          currentlyDisplayedKey = key;
          // Update active state
          container.querySelectorAll('.btn-copy-token').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  /**
   * Render full token details with header/payload/signature (for tab-based display)
   * @param {string} token - Token to display
   * @param {string} label - Token type label
   * @returns {string} - HTML string
   */
  renderTokenDetails(token, label) {
    if (!token) {
      return '<div class="token-empty">No token available</div>';
    }

    const decoded = decodeJwt(token);

    if (decoded) {
      return `
        <div class="token-section">
          <h4>Header</h4>
          <div class="token-json">${formatJson(decoded.header)}</div>
        </div>
        <div class="token-section">
          <h4>Payload</h4>
          <div class="token-json">${formatJson(decoded.payload)}</div>
        </div>
        <div class="token-section">
          <h4>Raw Token</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" data-token="${escapeHtml(token)}">Copy</button>
            <div class="token-raw">${escapeHtml(token)}</div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="token-section">
          <h4>Token (Opaque)</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" data-token="${escapeHtml(token)}">Copy</button>
            <div class="token-raw">${escapeHtml(token)}</div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Bind raw token copy buttons (used after renderTokenDetails)
   * @param {HTMLElement} container - Container with copy-raw-btn buttons
   */
  bindRawCopyButtons(container) {
    container.querySelectorAll('.copy-raw-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const token = btn.dataset.token;
        if (token) {
          await this.copyToClipboard(token);
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = orig;
          }, 1500);
        }
      });
    });
  }
}

/**
 * Create a tab-based token display manager
 * @param {object} tokens - Token storage object
 * @param {object} tabConfig - Tab configuration { tabSelector, contentId, tabs: [{id, key, label}] }
 * @returns {object} - Token tabs manager
 */
export function createTokenTabs(tokens, tabConfig) {
  const display = new TokenDisplay(tokens);
  let currentTab = null;

  function switchTab(tabId) {
    // Update tab active states
    document.querySelectorAll(tabConfig.tabSelector).forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Find tab config
    const tab = tabConfig.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Render token
    const content = document.getElementById(tabConfig.contentId);
    const token = tokens[tab.key];
    content.innerHTML = display.renderTokenDetails(token, tab.label);
    display.bindRawCopyButtons(content);

    currentTab = tabId;
  }

  function init() {
    document.querySelectorAll(tabConfig.tabSelector).forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  return { init, switchTab, getCurrentTab: () => currentTab };
}

// Default export
export default TokenDisplay;
