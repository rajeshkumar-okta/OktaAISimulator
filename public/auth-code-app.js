// Authorization Code Flow - Simplified app.js

/**
 * Safe fetch wrapper that handles errors properly
 */
async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      error = data.error || error;
    } catch {
      error = `${error}: ${res.statusText}`;
    }
    throw new Error(error);
  }
  return res.json();
}

const CONFIG_KEY = 'okta_auth_code_config';
const CONFIG_META_KEY = 'okta_auth_code_config_meta';
const CONFIG_TYPE = 'auth-code-flow';
const CONFIG_FIELDS = [
  'oktaDomain',
  'clientId',
  'clientSecret',
  'redirectUri',
  'scopes',
  'responseType',
  'authorizationServerId',
  'resourceServerAudience',
  'tokenExchangeScope',
  'principalId',
  'privateJwk',
];

const tokens = {
  idToken: null,
  accessToken: null,
  refreshToken: null,
};

// Scope selector state
let availableScopes = [];
let selectedScopes = new Set(['openid', 'profile', 'email']); // Default scopes
let customScopes = new Set();
let fetchScopesTimeout = null;

// Standard OAuth scopes (shown last, colored yellow)
const STANDARD_SCOPES = new Set([
  'openid',
  'profile',
  'email',
  'address',
  'phone',
  'offline_access',
  'device_sso'
]);

// Standard scopes to always show as fallback (for Org Auth Server)
const FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'];

// Response type selector state
let availableResponseTypes = [];
let selectedResponseType = 'code'; // Default to authorization code flow

// Standard response types (always shown as fallback)
const STANDARD_RESPONSE_TYPES = ['code', 'token', 'id_token', 'code token', 'code id_token', 'id_token token', 'code id_token token'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadConfigFromStorage();
  setupAuthMethodToggle();
  setupRedirectUriMode();
  setupAuthServerMode();
  setupStateNonceMode();
  setupOktaDomainAutoCorrect();
  updateCurlCommands();

  // Listen for OAuth callback via BroadcastChannel
  const channel = new BroadcastChannel('oauth-callback');
  channel.onmessage = (event) => handleOAuthResult(event.data);

  // Also listen via postMessage for browsers without BroadcastChannel support
  window.addEventListener('message', handleOAuthMessage);

  // Bind buttons
  document.getElementById('btn-step-1').addEventListener('click', doLogin);
  document.getElementById('reset-btn').addEventListener('click', doReset);
  document.getElementById('view-logs-btn').addEventListener('click', () => {
    window.open('/log-viewer.html', '_blank');
  });
  document.getElementById('save-config-btn').addEventListener('click', saveConfig);
  document.getElementById('save-server-btn').addEventListener('click', saveToServer);
  document.getElementById('clear-config-btn').addEventListener('click', clearConfig);
  document.getElementById('load-saved-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openConfigsModal();
  });

  // Modal handlers
  document.getElementById('close-modal-btn').addEventListener('click', closeConfigsModal);
  document.getElementById('configs-modal').addEventListener('click', (e) => {
    if (e.target.id === 'configs-modal') closeConfigsModal();
  });

  // Save modal handlers are now managed by the promise-based openSaveModal function
  // Initialize mode toggle visibility
  const modeRadios = document.querySelectorAll('#save-modal input[name="save-mode"]');
  modeRadios.forEach(r => {
    r.addEventListener('change', () => {
      const mode = document.querySelector('#save-modal input[name="save-mode"]:checked')?.value || 'new';
      document.getElementById('save-new-field').hidden = mode !== 'new';
      document.getElementById('save-overwrite-field').hidden = mode !== 'overwrite';
    });
  });

  // Dialog modal
  document.getElementById('dialog-ok').addEventListener('click', closeDialog);
  document.getElementById('dialog-cancel').addEventListener('click', closeDialog);

  // Update curl on config changes
  document.querySelectorAll('#config-panel input, #config-panel select, #config-panel textarea').forEach(el => {
    el.addEventListener('input', updateCurlCommands);
    el.addEventListener('change', updateCurlCommands);
  });

  // Token tabs
  document.querySelectorAll('.token-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTokenTab(tab.dataset.tab));
  });

  // Initialize scope selector
  initScopeSelector();

  // Fetch scopes when okta domain or auth server changes
  const oktaDomainEl = document.getElementById('cfg-oktaDomain');
  if (oktaDomainEl) {
    oktaDomainEl.addEventListener('input', debouncedFetchScopes);
  }

  const authServerIdEl = document.getElementById('cfg-authorizationServerId');
  if (authServerIdEl) {
    authServerIdEl.addEventListener('input', debouncedFetchScopes);
  }
}

// --- Config management ---

function getConfig() {
  const cfg = {};
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) cfg[field] = el.value.trim();
  }
  cfg.redirectUri = getRedirectUri();
  cfg.clientAuthMethod = document.getElementById('cfg-clientAuthMethod').value;
  cfg.authServerMode = document.getElementById('cfg-authServerMode').value;
  // Set authorizationServerId based on mode
  cfg.authorizationServerId = getAuthServerId();

  // State and nonce settings
  const stateMode = document.getElementById('cfg-stateMode')?.value || 'random';
  const nonceMode = document.getElementById('cfg-nonceMode')?.value || 'random';
  cfg.stateMode = stateMode;
  cfg.nonceMode = nonceMode;
  if (stateMode === 'specify') {
    cfg.state = document.getElementById('cfg-state')?.value?.trim() || '';
  }
  if (nonceMode === 'specify') {
    cfg.nonce = document.getElementById('cfg-nonce')?.value?.trim() || '';
  }
  return cfg;
}

function loadConfigFromStorage() {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      for (const field of CONFIG_FIELDS) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field]) {
          if (field === 'scopes') {
            // Restore scope state
            restoreScopesFromString(cfg[field], cfg.customScopes || []);
          } else if (field === 'responseType') {
            // Restore response type state
            selectedResponseType = cfg[field] || 'code';
          } else {
            el.value = cfg[field];
          }
        }
      }
      if (cfg.clientAuthMethod) {
        document.getElementById('cfg-clientAuthMethod').value = cfg.clientAuthMethod;
      }
      if (cfg.authServerMode) {
        document.getElementById('cfg-authServerMode').value = cfg.authServerMode;
      }
      if (cfg.customScopes) {
        customScopes = new Set(cfg.customScopes);
      }
      // Restore state/nonce mode settings
      if (cfg.stateMode) {
        const stateMode = document.getElementById('cfg-stateMode');
        if (stateMode) stateMode.value = cfg.stateMode;
        if (cfg.stateMode === 'specify' && cfg.state) {
          const stateInput = document.getElementById('cfg-state');
          if (stateInput) stateInput.value = cfg.state;
        }
      }
      if (cfg.nonceMode) {
        const nonceMode = document.getElementById('cfg-nonceMode');
        if (nonceMode) nonceMode.value = cfg.nonceMode;
        if (cfg.nonceMode === 'specify' && cfg.nonce) {
          const nonceInput = document.getElementById('cfg-nonce');
          if (nonceInput) nonceInput.value = cfg.nonce;
        }
      }
      updateConfigStatus();
    } catch {}
  }
}

function saveConfig() {
  const cfg = getConfig();
  cfg.clientAuthMethod = document.getElementById('cfg-clientAuthMethod').value;
  // Include custom scopes for restoration later
  cfg.customScopes = Array.from(customScopes);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));

  // Update metadata for browser saves
  const existingMeta = localStorage.getItem(CONFIG_META_KEY);
  if (!existingMeta) {
    localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
      name: 'Local Config',
      source: 'browser',
      savedAt: new Date().toISOString(),
    }));
  }
  updateConfigStatus();
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(CONFIG_META_KEY);
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) el.value = '';
  }
  // Reset scopes to defaults
  selectedScopes = new Set(['openid', 'profile', 'email']);
  customScopes = new Set();
  availableScopes = [];
  document.getElementById('cfg-scopes').value = 'openid profile email';
  // Reset response type to default
  selectedResponseType = 'code';
  availableResponseTypes = [];
  document.getElementById('cfg-responseType').value = 'code';
  // Reset state/nonce to random
  const stateMode = document.getElementById('cfg-stateMode');
  const nonceMode = document.getElementById('cfg-nonceMode');
  const stateInput = document.getElementById('cfg-state');
  const nonceInput = document.getElementById('cfg-nonce');
  if (stateMode) stateMode.value = 'random';
  if (nonceMode) nonceMode.value = 'random';
  if (stateInput) { stateInput.value = ''; stateInput.hidden = true; }
  if (nonceInput) { nonceInput.value = ''; nonceInput.hidden = true; }
  renderScopeTiles();
  renderResponseTypeTiles();
  updateConfigStatus();
  updateCurlCommands();
}

function updateConfigStatus(msg) {
  const statusEl = document.getElementById('config-status');
  const saved = localStorage.getItem(CONFIG_KEY);
  const metaJson = localStorage.getItem(CONFIG_META_KEY);

  if (msg) {
    statusEl.textContent = `(${msg})`;
    statusEl.className = 'config-status';
    return;
  }

  if (saved && metaJson) {
    try {
      const meta = JSON.parse(metaJson);
      if (meta.source === 'server') {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(meta.name)}</span>`;
        statusEl.className = 'config-status saved';
      } else {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(meta.name)}</span> <span class="config-badge-browser">browser storage</span>`;
        statusEl.className = 'config-status';
      }
      return;
    } catch {}
  }

  if (saved) {
    statusEl.textContent = '(saved)';
    statusEl.className = 'config-status saved';
  } else {
    statusEl.textContent = '';
    statusEl.className = 'config-status';
  }
}

// --- Server config save/load ---

async function openSaveModal() {
  const overlay = document.getElementById('save-modal');
  const nameEl = document.getElementById('save-name');
  const existingEl = document.getElementById('save-existing');
  const newFieldEl = document.getElementById('save-new-field');
  const overwriteFieldEl = document.getElementById('save-overwrite-field');
  const okBtn = document.getElementById('save-modal-ok');
  const cancelBtn = document.getElementById('save-modal-cancel');
  const modeRadios = document.querySelectorAll('input[name="save-mode"]');

  // Check if we have an existing server config that current user owns
  let defaultToOverwrite = false;
  let defaultOverwriteId = null;
  try {
    const metaJson = localStorage.getItem(CONFIG_META_KEY);
    if (metaJson) {
      const meta = JSON.parse(metaJson);
      if (meta.source === 'server' && meta.serverId && meta.creator === getCurrentUserSub()) {
        defaultToOverwrite = true;
        defaultOverwriteId = meta.serverId;
      }
    }
  } catch {}

  // Reset to appropriate default state
  nameEl.value = '';
  modeRadios.forEach(r => r.checked = r.value === (defaultToOverwrite ? 'overwrite' : 'new'));
  newFieldEl.hidden = defaultToOverwrite;
  overwriteFieldEl.hidden = !defaultToOverwrite;

  // Fetch existing configs for this flow type
  existingEl.innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await fetch('/api/configs');
    const allConfigs = await res.json();
    const configs = allConfigs.filter(c => c.configurationType === CONFIG_TYPE);

    if (configs.length === 0) {
      existingEl.innerHTML = '<option value="">No saved configurations</option>';
      modeRadios.forEach(r => r.checked = r.value === 'new');
      newFieldEl.hidden = false;
      overwriteFieldEl.hidden = true;
    } else {
      existingEl.innerHTML = configs.map(c => {
        const date = new Date(c.updatedAt).toLocaleDateString();
        return `<option value="${c.id}">${escapeHtml(c.name)} (${date})</option>`;
      }).join('');

      if (defaultToOverwrite && defaultOverwriteId) {
        existingEl.value = defaultOverwriteId;
      }
    }
  } catch {
    existingEl.innerHTML = '<option value="">Failed to load</option>';
  }

  overlay.hidden = false;
  if (!defaultToOverwrite) {
    nameEl.focus();
  }

  // Handle mode toggle
  function updateMode() {
    const mode = document.querySelector('input[name="save-mode"]:checked')?.value || 'new';
    newFieldEl.hidden = mode !== 'new';
    overwriteFieldEl.hidden = mode !== 'overwrite';
    if (mode === 'new') {
      nameEl.focus();
    }
  }
  modeRadios.forEach(r => r.addEventListener('change', updateMode));

  return new Promise((resolve) => {
    function cleanup() {
      overlay.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      modeRadios.forEach(r => r.removeEventListener('change', updateMode));
    }

    function onOk() {
      const mode = document.querySelector('input[name="save-mode"]:checked')?.value || 'new';
      if (mode === 'new') {
        const name = nameEl.value.trim();
        if (!name) return;
        cleanup();
        resolve({ mode: 'new', name });
      } else {
        const id = existingEl.value;
        if (!id) return;
        const selectedOption = existingEl.options[existingEl.selectedIndex];
        const name = selectedOption?.textContent?.split(' (')[0] || 'Configuration';
        cleanup();
        resolve({ mode: 'overwrite', id, name });
      }
    }

    function onCancel() { cleanup(); resolve(null); }
    function onOverlay(e) { if (e.target === overlay) onCancel(); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}

async function saveToServer() {
  const result = await openSaveModal();
  if (!result) return;

  const cfg = getConfig();
  cfg.clientAuthMethod = document.getElementById('cfg-clientAuthMethod').value;
  cfg.customScopes = Array.from(customScopes); // Include for restoration
  const note = document.getElementById('cfg-note')?.value.trim() || '';
  const creator = getCurrentUserSub();

  try {
    if (result.mode === 'new') {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.name, creator, note, configurationType: CONFIG_TYPE, config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
        name: result.name,
        source: 'server',
        serverId: data.id,
        creator: creator,
        savedAt: new Date().toISOString(),
      }));
      updateConfigStatus();
      showDialog(`Configuration saved as "${result.name}"`, 'Saved');
    } else {
      const res = await fetch(`/api/configs/${result.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let existingCreator = creator;
      try {
        const existingMeta = JSON.parse(localStorage.getItem(CONFIG_META_KEY));
        if (existingMeta?.creator) existingCreator = existingMeta.creator;
      } catch {}
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
        name: result.name,
        source: 'server',
        serverId: result.id,
        creator: existingCreator,
        savedAt: new Date().toISOString(),
      }));
      updateConfigStatus();
      showDialog(`Configuration "${result.name}" updated`, 'Updated');
    }
  } catch (err) {
    showDialog('Failed to save: ' + err.message, 'Error');
  }
}

function closeSaveModal() {
  document.getElementById('save-modal').hidden = true;
}

// Legacy function for backward compatibility
async function confirmSaveToServer() {
  // This is now handled by the promise-based openSaveModal
}

function getCurrentUserSub() {
  try {
    const userJson = localStorage.getItem('okta_current_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      return user.sub || 'unknown';
    }
  } catch {}
  return 'unknown';
}

async function openConfigsModal() {
  document.getElementById('configs-modal').hidden = false;
  const listEl = document.getElementById('configs-list');
  listEl.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res = await fetch('/api/configs');
    const allConfigs = await res.json();

    // Filter to only show configs for this flow type
    const configs = allConfigs.filter(c => c.configurationType === CONFIG_TYPE);
    const currentUserSub = getCurrentUserSub();

    if (configs.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No saved configurations for this flow</p>';
      return;
    }

    listEl.innerHTML = configs.map(c => {
      const canDelete = c.creator === currentUserSub;
      return `
        <div class="config-card" data-id="${c.id}">
          <div class="config-card-header">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="config-card-creator">by ${escapeHtml(c.creator)}</span>
          </div>
          <div class="config-card-domain">${escapeHtml(c.config?.oktaDomain || '—')}</div>
          <div class="config-card-actions">
            <button class="btn btn-primary btn-small load-config-btn">Load</button>
            ${canDelete ? '<button class="btn btn-secondary btn-small delete-config-btn">Delete</button>' : ''}
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.load-config-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.config-card');
        const cfg = configs.find(c => c.id === card.dataset.id);
        if (cfg) loadConfig(cfg.config, { id: cfg.id, name: cfg.name, creator: cfg.creator });
      });
    });

    listEl.querySelectorAll('.delete-config-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.config-card');
        await deleteConfig(card.dataset.id);
        openConfigsModal();
      });
    });
  } catch (err) {
    listEl.innerHTML = '<p class="error-state">Failed to load configurations</p>';
  }
}

function closeConfigsModal() {
  document.getElementById('configs-modal').hidden = true;
}

function loadConfig(cfg, meta = null) {
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el && cfg[field] !== undefined) {
      if (field === 'scopes') {
        // Restore scope state
        restoreScopesFromString(cfg[field], cfg.customScopes || []);
      } else if (field === 'responseType') {
        // Restore response type state
        selectedResponseType = cfg[field] || 'code';
      } else {
        el.value = cfg[field];
      }
    }
  }
  if (cfg.clientAuthMethod) {
    document.getElementById('cfg-clientAuthMethod').value = cfg.clientAuthMethod;
  }
  if (cfg.authServerMode) {
    document.getElementById('cfg-authServerMode').value = cfg.authServerMode;
  }
  if (cfg.customScopes) {
    customScopes = new Set(cfg.customScopes);
  }
  // Restore state/nonce mode settings
  if (cfg.stateMode) {
    const stateMode = document.getElementById('cfg-stateMode');
    if (stateMode) stateMode.value = cfg.stateMode;
    if (cfg.stateMode === 'specify' && cfg.state) {
      const stateInput = document.getElementById('cfg-state');
      if (stateInput) stateInput.value = cfg.state;
    }
  }
  if (cfg.nonceMode) {
    const nonceMode = document.getElementById('cfg-nonceMode');
    if (nonceMode) nonceMode.value = cfg.nonceMode;
    if (cfg.nonceMode === 'specify' && cfg.nonce) {
      const nonceInput = document.getElementById('cfg-nonce');
      if (nonceInput) nonceInput.value = cfg.nonce;
    }
  }
  setupAuthMethodToggle();
  setupAuthServerMode();
  setupStateNonceMode();
  closeConfigsModal();

  // Save to local storage with server metadata
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  if (meta) {
    localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
      name: meta.name,
      source: 'server',
      serverId: meta.id,
      creator: meta.creator,
      savedAt: new Date().toISOString(),
    }));
  }
  updateConfigStatus();

  // Fetch scopes/response types and render tiles
  fetchScopes();
}

async function deleteConfig(id) {
  try {
    await fetch(`/api/configs/${id}`, { method: 'DELETE' });
  } catch {}
}

// --- UI helpers ---

function setupAuthMethodToggle() {
  const select = document.getElementById('cfg-clientAuthMethod');
  const secretRow = document.getElementById('cfg-clientSecret-row');

  function update() {
    const method = select.value;
    if (secretRow) {
      secretRow.style.display = method === 'client_secret' ? '' : 'none';
    }
  }

  select.addEventListener('change', () => {
    update();
    updateCurlCommands();
  });
  update();
}

function setupRedirectUriMode() {
  const modeSelect = document.getElementById('cfg-redirectUriMode');
  const customInput = document.getElementById('cfg-redirectUri');
  const preview = document.getElementById('redirect-uri-preview');

  function update() {
    const isCustom = modeSelect.value === 'custom';
    customInput.hidden = !isCustom;
    preview.hidden = isCustom;
    if (!isCustom) {
      preview.textContent = `${window.location.origin}/callback`;
    }
  }

  modeSelect.addEventListener('change', () => {
    update();
    updateCurlCommands();
  });
  update();
}

function getRedirectUri() {
  const mode = document.getElementById('cfg-redirectUriMode').value;
  if (mode === 'custom') {
    return document.getElementById('cfg-redirectUri').value.trim();
  }
  return `${window.location.origin}/callback`;
}

function setupAuthServerMode() {
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');
  const preview = document.getElementById('auth-server-preview');
  const endpointPreview = document.getElementById('auth-endpoint-preview');

  function update() {
    const mode = modeSelect.value;
    const isCustom = mode === 'custom';
    customInput.hidden = !isCustom;
    preview.hidden = isCustom;

    // Update preview text and endpoint display
    let pathSegment;
    if (mode === 'org') {
      preview.textContent = 'oauth2/v1';
      pathSegment = 'oauth2/v1';
    } else if (mode === 'default') {
      preview.textContent = 'oauth2/default/v1';
      pathSegment = 'oauth2/default/v1';
    } else {
      const customId = customInput.value.trim() || '{auth-server-id}';
      pathSegment = `oauth2/${customId}/v1`;
    }

    if (endpointPreview) {
      endpointPreview.textContent = `${pathSegment}/authorize`;
    }
  }

  modeSelect.addEventListener('change', () => {
    update();
    updateCurlCommands();
    debouncedFetchScopes(); // Fetch scopes for new auth server
  });
  customInput.addEventListener('input', () => {
    update();
    updateCurlCommands();
    debouncedFetchScopes(); // Fetch scopes for new auth server
  });
  update();
}

function getAuthServerPath() {
  const mode = document.getElementById('cfg-authServerMode').value;
  if (mode === 'org') {
    return 'oauth2/v1';
  } else if (mode === 'default') {
    return 'oauth2/default/v1';
  } else {
    const customId = document.getElementById('cfg-authorizationServerId').value.trim();
    return customId ? `oauth2/${customId}/v1` : 'oauth2/v1';
  }
}

function getAuthServerId() {
  const mode = document.getElementById('cfg-authServerMode').value;
  if (mode === 'org') {
    return ''; // Org AS has no ID
  } else if (mode === 'default') {
    return 'default';
  } else {
    return document.getElementById('cfg-authorizationServerId').value.trim();
  }
}

function setupStateNonceMode() {
  const stateMode = document.getElementById('cfg-stateMode');
  const stateInput = document.getElementById('cfg-state');
  const nonceMode = document.getElementById('cfg-nonceMode');
  const nonceInput = document.getElementById('cfg-nonce');

  function updateStateVisibility() {
    const isSpecify = stateMode.value === 'specify';
    stateInput.hidden = !isSpecify;
    updateCurlCommands();
  }

  function updateNonceVisibility() {
    const isSpecify = nonceMode.value === 'specify';
    nonceInput.hidden = !isSpecify;
    updateCurlCommands();
  }

  if (stateMode) {
    stateMode.addEventListener('change', updateStateVisibility);
    updateStateVisibility();
  }

  if (nonceMode) {
    nonceMode.addEventListener('change', updateNonceVisibility);
    updateNonceVisibility();
  }

  if (stateInput) {
    stateInput.addEventListener('input', updateCurlCommands);
  }

  if (nonceInput) {
    nonceInput.addEventListener('input', updateCurlCommands);
  }
}

function showDialog(message, title = 'Notice') {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-message').textContent = message;
  document.getElementById('dialog-modal').hidden = false;
}

function closeDialog() {
  document.getElementById('dialog-modal').hidden = true;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Scope Selector ---

function initScopeSelector() {
  const addBtn = document.getElementById('scope-add-btn');
  const inputEl = document.getElementById('scope-custom-input');

  if (addBtn) {
    addBtn.addEventListener('click', addCustomScope);
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomScope();
      }
    });
  }

  // Initial fetch if config is already populated
  const oktaDomain = document.getElementById('cfg-oktaDomain')?.value?.trim();
  const authServerId = getAuthServerId();
  if (oktaDomain && authServerId) {
    fetchScopes();
  } else {
    // Render defaults even without fetching
    renderScopeTiles();
    renderResponseTypeTiles();
  }
}

function debouncedFetchScopes() {
  if (fetchScopesTimeout) clearTimeout(fetchScopesTimeout);
  fetchScopesTimeout = setTimeout(fetchScopes, 500);
}

async function fetchScopes() {
  const oktaDomain = document.getElementById('cfg-oktaDomain')?.value?.trim();
  const authServerId = getAuthServerId();
  const scopeLoadingEl = document.getElementById('scope-loading');
  const responseTypeLoadingEl = document.getElementById('response-type-loading');

  if (!oktaDomain || !authServerId) {
    // Clear available but still render with fallback standard scopes/response types
    availableScopes = [];
    availableResponseTypes = [];
    renderScopeTiles(); // Shows standard scopes as fallback
    renderResponseTypeTiles(); // Shows standard response types as fallback
    return;
  }

  if (scopeLoadingEl) {
    scopeLoadingEl.textContent = 'Loading...';
    scopeLoadingEl.style.display = '';
  }
  if (responseTypeLoadingEl) {
    responseTypeLoadingEl.textContent = 'Loading...';
    responseTypeLoadingEl.style.display = '';
  }

  try {
    const wellKnownUrl = `${oktaDomain}/oauth2/${authServerId}/.well-known/oauth-authorization-server`;
    const response = await fetch(wellKnownUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    availableScopes = data.scopes_supported || [];
    availableResponseTypes = data.response_types_supported || [];

    if (scopeLoadingEl) scopeLoadingEl.style.display = 'none';
    if (responseTypeLoadingEl) responseTypeLoadingEl.style.display = 'none';
    renderScopeTiles();
    renderResponseTypeTiles();
  } catch (err) {
    console.error('Failed to fetch from well-known:', err);
    // Clear available but still render with fallback standard scopes/response types
    availableScopes = [];
    availableResponseTypes = [];
    renderScopeTiles(); // Will show standard scopes as fallback
    renderResponseTypeTiles(); // Will show standard response types as fallback
  }
}

function isStandardScope(scope) {
  return STANDARD_SCOPES.has(scope);
}

function renderScopeTiles() {
  const tilesEl = document.getElementById('scope-tiles');
  const loadingEl = document.getElementById('scope-loading');
  if (!tilesEl) return;

  // Use available scopes from well-known, or fall back to standard scopes
  const scopesToRender = availableScopes.length > 0 ? availableScopes : FALLBACK_SCOPES;

  // Sort scopes: non-standard first, then standard
  const sortedScopes = [...scopesToRender].sort((a, b) => {
    const aStandard = isStandardScope(a);
    const bStandard = isStandardScope(b);
    if (aStandard && !bStandard) return 1;
    if (!aStandard && bStandard) return -1;
    return a.localeCompare(b);
  });

  let tilesHtml = '';

  // Render scopes (from well-known or fallback)
  for (const scope of sortedScopes) {
    const isSelected = selectedScopes.has(scope);
    const isStandard = isStandardScope(scope);
    const cls = (isSelected ? 'scope-tile selected' : 'scope-tile available') + (isStandard ? ' standard' : '');
    tilesHtml += `<span class="${cls}" data-scope="${escapeAttr(scope)}" onclick="toggleScope('${escapeAttr(scope)}')">${escapeHtml(scope)}</span>`;
  }

  // Render custom scopes (always selected, with remove button)
  for (const scope of customScopes) {
    if (scopesToRender.includes(scope)) continue;
    tilesHtml += `<span class="scope-tile custom" data-scope="${escapeAttr(scope)}">${escapeHtml(scope)}<span class="scope-remove" onclick="removeCustomScope('${escapeAttr(scope)}')">&times;</span></span>`;
  }

  // Also render any selected scopes that aren't in scopesToRender or customScopes
  for (const scope of selectedScopes) {
    if (scopesToRender.includes(scope) || customScopes.has(scope)) continue;
    const isStandard = isStandardScope(scope);
    const cls = 'scope-tile selected' + (isStandard ? ' standard' : '');
    tilesHtml += `<span class="${cls}" data-scope="${escapeAttr(scope)}" onclick="toggleScope('${escapeAttr(scope)}')">${escapeHtml(scope)}</span>`;
  }

  tilesEl.innerHTML = '';

  if (loadingEl) {
    tilesEl.appendChild(loadingEl);
    if (tilesHtml) {
      loadingEl.style.display = 'none';
    } else {
      loadingEl.style.display = '';
    }
  }

  if (tilesHtml) {
    const tilesContainer = document.createElement('span');
    tilesContainer.innerHTML = tilesHtml;
    while (tilesContainer.firstChild) {
      tilesEl.appendChild(tilesContainer.firstChild);
    }
  }

  updateScopeHiddenInput();
  updateCurlCommands();
}

function toggleScope(scope) {
  if (selectedScopes.has(scope)) {
    selectedScopes.delete(scope);
  } else {
    selectedScopes.add(scope);
  }
  renderScopeTiles();
}

function addCustomScope() {
  const inputEl = document.getElementById('scope-custom-input');
  const scope = inputEl?.value?.trim();

  if (!scope) return;

  if (customScopes.has(scope) || (availableScopes.includes(scope) && selectedScopes.has(scope))) {
    inputEl.value = '';
    return;
  }

  if (availableScopes.includes(scope)) {
    selectedScopes.add(scope);
  } else {
    customScopes.add(scope);
    selectedScopes.add(scope);
  }

  inputEl.value = '';
  renderScopeTiles();
}

function removeCustomScope(scope) {
  customScopes.delete(scope);
  selectedScopes.delete(scope);
  renderScopeTiles();
}

function updateScopeHiddenInput() {
  const hiddenEl = document.getElementById('cfg-scopes');
  if (hiddenEl) {
    const allSelected = Array.from(selectedScopes);
    hiddenEl.value = allSelected.join(' ');
  }
}

function restoreScopesFromString(scopeString, customScopesList) {
  if (!scopeString) {
    selectedScopes = new Set(['openid', 'profile', 'email']); // Default
    customScopes = new Set(customScopesList || []);
    return;
  }
  const scopes = scopeString.split(/\s+/).filter(s => s);
  selectedScopes = new Set(scopes);
  customScopes = new Set(customScopesList || []);
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// --- Response Type Selector ---

function renderResponseTypeTiles() {
  const tilesEl = document.getElementById('response-type-tiles');
  const loadingEl = document.getElementById('response-type-loading');
  if (!tilesEl) return;

  // Use available response types from well-known, or fall back to standard types
  const typesToRender = availableResponseTypes.length > 0 ? availableResponseTypes : STANDARD_RESPONSE_TYPES;

  // Sort response types: 'code' first, then alphabetical
  const sortedTypes = [...typesToRender].sort((a, b) => {
    if (a === 'code') return -1;
    if (b === 'code') return 1;
    return a.localeCompare(b);
  });

  let tilesHtml = '';

  // Render response types
  for (const responseType of sortedTypes) {
    const isSelected = selectedResponseType === responseType;
    const cls = isSelected ? 'scope-tile selected' : 'scope-tile available';
    tilesHtml += `<span class="${cls}" data-response-type="${escapeAttr(responseType)}" onclick="selectResponseType('${escapeAttr(responseType)}')">${escapeHtml(responseType)}</span>`;
  }

  tilesEl.innerHTML = '';

  if (loadingEl) {
    tilesEl.appendChild(loadingEl);
    if (tilesHtml) {
      loadingEl.style.display = 'none';
    } else {
      loadingEl.style.display = '';
    }
  }

  if (tilesHtml) {
    const tilesContainer = document.createElement('span');
    tilesContainer.innerHTML = tilesHtml;
    while (tilesContainer.firstChild) {
      tilesEl.appendChild(tilesContainer.firstChild);
    }
  }

  updateResponseTypeHiddenInput();
  updateCurlCommands();
}

function selectResponseType(responseType) {
  selectedResponseType = responseType;
  renderResponseTypeTiles();
}

function updateResponseTypeHiddenInput() {
  const hiddenEl = document.getElementById('cfg-responseType');
  if (hiddenEl) {
    hiddenEl.value = selectedResponseType || 'code';
  }
}

// Expose toggle functions to onclick handlers
window.toggleScope = toggleScope;
window.removeCustomScope = removeCustomScope;
window.selectResponseType = selectResponseType;

// --- Curl commands ---

function updateCurlCommands() {
  const c = getConfig();
  const esc = escapeHtml;

  const domain = c.oktaDomain || '${OKTA_DOMAIN}';
  const clientId = c.clientId || '${CLIENT_ID}';
  const clientSecret = c.clientSecret || '${CLIENT_SECRET}';
  const redirectUri = c.redirectUri || '${REDIRECT_URI}';
  const scopes = c.scopes || 'openid profile email';
  const authServerPath = getAuthServerPath();

  // Authorize URL
  const authMethod = document.getElementById('cfg-clientAuthMethod').value;
  const pkceParams = authMethod === 'pkce'
    ? `\n  <span class="curl-flag">&code_challenge=</span><span class="curl-data">{S256_HASH}</span>\n  <span class="curl-flag">&code_challenge_method=</span><span class="curl-data">S256</span>`
    : '';

  const responseType = selectedResponseType || 'code';

  // Determine state and nonce display values
  const stateModeVal = document.getElementById('cfg-stateMode')?.value || 'random';
  const nonceModeVal = document.getElementById('cfg-nonceMode')?.value || 'random';
  const stateDisplay = stateModeVal === 'specify'
    ? (document.getElementById('cfg-state')?.value?.trim() || '{specified}')
    : '{random}';
  const nonceDisplay = nonceModeVal === 'specify'
    ? (document.getElementById('cfg-nonce')?.value?.trim() || '{specified}')
    : '{random}';

  document.getElementById('curl-1-authorize').innerHTML =
    `<span class="curl-comment"># Browser redirect (not a cURL call)</span>\n` +
    `<span class="curl-cmd">GET</span> <span class="curl-url">${esc(domain)}/${authServerPath}/authorize</span>\n` +
    `  <span class="curl-flag">?client_id=</span><span class="curl-data">${esc(clientId)}</span>\n` +
    `  <span class="curl-flag">&response_type=</span><span class="curl-data">${esc(responseType)}</span>\n` +
    `  <span class="curl-flag">&scope=</span><span class="curl-data">${esc(scopes)}</span>\n` +
    `  <span class="curl-flag">&redirect_uri=</span><span class="curl-data">${esc(redirectUri)}</span>\n` +
    `  <span class="curl-flag">&state=</span><span class="curl-data">${esc(stateDisplay)}</span>\n` +
    `  <span class="curl-flag">&nonce=</span><span class="curl-data">${esc(nonceDisplay)}</span>` + pkceParams;

  // Token exchange
  let authParams = '';
  if (authMethod === 'client_secret') {
    authParams =
      `      <span class="curl-data">&client_id=${esc(clientId)}</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&client_secret=${esc(clientSecret)}</span> <span class="curl-flag">\\</span>\n`;
  } else if (authMethod === 'private_key') {
    authParams =
      `      <span class="curl-data">&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&client_assertion={JWT_CLIENT_ASSERTION}</span> <span class="curl-flag">\\</span>\n`;
  } else if (authMethod === 'pkce') {
    authParams =
      `      <span class="curl-data">&client_id=${esc(clientId)}</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&code_verifier={CODE_VERIFIER}</span> <span class="curl-flag">\\</span>\n`;
  }

  document.getElementById('curl-1-token').innerHTML =
    `<span class="curl-cmd">curl</span> <span class="curl-flag">-X POST</span> <span class="curl-url">${esc(domain)}/${authServerPath}/token</span> <span class="curl-flag">\\</span>\n` +
    `  <span class="curl-flag">-H</span> <span class="curl-data">"Content-Type: application/x-www-form-urlencoded"</span> <span class="curl-flag">\\</span>\n` +
    `  <span class="curl-flag">-d</span> <span class="curl-data">"grant_type=authorization_code</span> <span class="curl-flag">\\</span>\n` +
    authParams +
    `      <span class="curl-data">&redirect_uri=${esc(redirectUri)}</span> <span class="curl-flag">\\</span>\n` +
    `      <span class="curl-data">&code={AUTHORIZATION_CODE}"</span>`;
}

// --- Login flow ---

function getCurrentUserName() {
  try {
    const userJson = localStorage.getItem('okta_current_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      return user.name || user.email || user.sub || null;
    }
  } catch {}
  return null;
}

async function doLogin() {
  saveConfig();
  const cfg = getConfig();
  cfg.userName = getCurrentUserName(); // For logging purposes
  showLoading();

  try {
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });

    // Check status before trying to parse JSON
    if (!res.ok) {
      let error = 'Request failed';
      try {
        const data = await res.json();
        error = data.error || `HTTP ${res.status}`;
      } catch {
        error = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(error);
    }

    const data = await res.json();

    // Open OAuth login in popup
    const w = 500, h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      data.authUrl,
      'okta-login',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups for this site.');
    }

    // Poll in case popup is closed without completing
    const pollTimer = setInterval(async () => {
      if (popup.closed) {
        clearInterval(pollTimer);
        const resultEl = document.getElementById('result-1');
        if (!resultEl.querySelector('.result-box')) {
          // Try to fetch the actual error from the server logs
          try {
            const res = await fetch('/api/logs/last-error');
            if (res.ok) {
              const data = await res.json();
              if (data.error && data.error.message) {
                showError(data.error.message);
              } else {
                showError('Login window was closed before completing.');
              }
            } else {
              showError('Login window was closed before completing.');
            }
          } catch {
            showError('Login window was closed before completing.');
          }
        }
      }
    }, 500);
  } catch (err) {
    showError(err.message);
  }
}


function handleOAuthMessage(event) {
  if (event.origin !== window.location.origin) return;
  handleOAuthResult(event.data);
}

function handleOAuthResult(data) {
  if (!data || data.type !== 'oauth-callback') return;

  if (data.error) {
    showError(data.error);
  } else if (data.success) {
    tokens.idToken = data.idToken || null;
    tokens.accessToken = data.accessToken || null;
    tokens.refreshToken = data.refreshToken || null;

    if (data.curl) {
      showActualCurl('curl-1-token', data.curl);
    }

    markCompleted(data.claims);
    showTokenDetails();
    updateCurlCommands();
  }
}

// --- UI state ---

function showLoading() {
  const resultEl = document.getElementById('result-1');
  resultEl.innerHTML = '<div class="loading">Authenticating...</div>';
  resultEl.classList.add('visible');
}

function showError(message) {
  const stepEl = document.getElementById('step-1');
  stepEl.classList.add('error');
  const resultEl = document.getElementById('result-1');
  const logLink = ` <a class="log-link" href="/log-viewer.html" target="_blank">view log</a>`;
  resultEl.innerHTML = `<div class="error-box">${escapeHtml(message)}${logLink}</div>`;
  resultEl.classList.add('visible');
}

function markCompleted(claims) {
  const stepEl = document.getElementById('step-1');
  stepEl.classList.remove('error');
  stepEl.classList.add('completed');

  // Just show a simple success message - token details are in the section below
  const resultEl = document.getElementById('result-1');
  const sub = claims?.sub || 'user';
  resultEl.innerHTML = `<div class="result-box" style="background:#d1fae5;border-color:#6ee7b7;color:#065f46;">Authentication successful for <strong>${escapeHtml(sub)}</strong>. See token details below.</div>`;
  resultEl.classList.add('visible');
}

function showActualCurl(elementId, curl) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '<span class="curl-comment"># Actual request sent:</span>\n' + formatCurl(curl);
  el.classList.add('curl-actual');
}

function formatCurl(curlStr) {
  const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Parse the cURL command
  // Expected format: curl -X POST 'url' \n  -H 'header' \n  -d 'params'
  const lines = curlStr.split('\n');
  const outputLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle comment lines
    if (trimmed.startsWith('#')) {
      outputLines.push('<span class="curl-comment">' + e(line) + '</span>');
      continue;
    }

    // Check if this line has -d with data to split
    const dataMatch = trimmed.match(/^-d\s+['"](.+)['"]$/);
    if (dataMatch) {
      const dataContent = dataMatch[1];
      // Split by & to get individual parameters
      const params = dataContent.split('&');
      params.forEach((param, idx) => {
        const isLast = idx === params.length - 1;
        const continuation = isLast ? '' : ' <span class="curl-flag">\\</span>';
        outputLines.push('  <span class="curl-flag">-d</span> <span class="curl-data">\'' + e(param) + '\'</span>' + continuation);
      });
      continue;
    }

    // Handle curl command line
    if (trimmed.startsWith('curl ')) {
      let formatted = line;
      // Replace curl command
      formatted = formatted.replace(/^(\s*)(curl)(\s)/, '$1<span class="curl-cmd">$2</span>$3');
      // Replace -X METHOD
      formatted = formatted.replace(/(-X)\s+(\S+)/, '<span class="curl-flag">$1</span> <span class="curl-flag">$2</span>');
      // Replace URL in single quotes
      formatted = formatted.replace(/'(https?:\/\/[^']+)'/, '\'<span class="curl-url">$1</span>\'');
      // Replace trailing backslash
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Handle -H header line
    if (trimmed.startsWith('-H ')) {
      let formatted = line;
      formatted = formatted.replace(/(-H)\s+'([^']+)'/, '<span class="curl-flag">$1</span> <span class="curl-data">\'$2\'</span>');
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Default: escape and output as-is
    outputLines.push(e(line));
  }

  return outputLines.join('\n');
}

function formatJSON(obj) {
  return escapeHtml(JSON.stringify(obj, null, 2));
}

async function doReset() {
  await fetch('/api/steps/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: getCurrentUserName() }),
  });
  tokens.idToken = null;
  tokens.accessToken = null;
  tokens.refreshToken = null;

  const stepEl = document.getElementById('step-1');
  stepEl.classList.remove('completed', 'error');

  const resultEl = document.getElementById('result-1');
  resultEl.innerHTML = '';
  resultEl.classList.remove('visible');

  document.getElementById('token-details').hidden = true;
  updateCurlCommands();
}

// --- Token details panel ---

function showTokenDetails() {
  document.getElementById('token-details').hidden = false;
  switchTokenTab('id-token');
}

function switchTokenTab(tabId) {
  document.querySelectorAll('.token-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.token-tab[data-tab="${tabId}"]`).classList.add('active');

  const content = document.getElementById('token-content');
  let token = null;
  let label = '';

  switch (tabId) {
    case 'id-token':
      token = tokens.idToken;
      label = 'ID Token';
      break;
    case 'access-token':
      token = tokens.accessToken;
      label = 'Access Token';
      break;
    case 'refresh-token':
      token = tokens.refreshToken;
      label = 'Refresh Token';
      break;
  }

  if (!token) {
    content.innerHTML = '<p class="empty-state">No token available</p>';
    return;
  }

  // Decode JWT
  try {
    const parts = token.split('.');
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));

    content.innerHTML = `
      <div class="token-section">
        <h4>Header</h4>
        <pre class="token-json">${escapeHtml(JSON.stringify(header, null, 2))}</pre>
      </div>
      <div class="token-section">
        <h4>Payload</h4>
        <pre class="token-json">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      </div>
      <div class="token-section">
        <h4>Raw Token</h4>
        <div class="token-raw-container">
          <pre class="token-raw">${escapeHtml(token)}</pre>
          <button class="btn btn-secondary btn-small copy-raw-btn">Copy</button>
        </div>
      </div>
    `;

    content.querySelector('.copy-raw-btn').addEventListener('click', (e) => {
      navigator.clipboard.writeText(token);
      e.target.textContent = 'Copied!';
      setTimeout(() => e.target.textContent = 'Copy', 1500);
    });
  } catch {
    content.innerHTML = `
      <div class="token-section">
        <h4>Raw Token</h4>
        <pre class="token-raw">${escapeHtml(token)}</pre>
      </div>
    `;
  }
}

// --- Okta domain auto-correct ---

function setupOktaDomainAutoCorrect() {
  const input = document.getElementById('cfg-oktaDomain');
  if (!input) return;

  input.addEventListener('input', autoCorrectOktaDomain);
  input.addEventListener('paste', () => {
    setTimeout(autoCorrectOktaDomain, 0);
  });
}

/**
 * Auto-correct Okta admin URLs by removing "-admin" from the domain.
 * e.g., https://dev-12345-admin.okta.com -> https://dev-12345.okta.com
 */
function autoCorrectOktaDomain() {
  const input = document.getElementById('cfg-oktaDomain');
  const value = input.value;

  const corrected = value.replace(/-admin\.(okta|oktapreview|okta-emea|okta-gov)/gi, '.$1');

  if (corrected !== value) {
    input.value = corrected;
    input.style.backgroundColor = '#d1fae5';
    setTimeout(() => {
      input.style.backgroundColor = '';
    }, 1000);
  }
}
