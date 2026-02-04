// Token state populated as steps complete
const tokens = {
  idToken: null,
  accessToken: null,
  refreshToken: null,
  idJagToken: null,
  authServerToken: null,
};

const CONFIG_KEY = 'okta_agentic_config';
const CONFIG_META_KEY = 'okta_agentic_config_meta';
const CONFIG_TYPE = 'agentic-token-exchange';
const CONFIG_FIELDS = [
  'oktaDomain',
  'clientId',
  'clientSecret',
  'redirectUri',
  'principalId',
  'privateJwk',
  'authorizationServerId',
  'tokenExchangeScope',
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadConfigFromStorage();
  updateConfigStatus();
  updateCurlCommands();

  // Expand config panel if no saved config
  if (!localStorage.getItem(CONFIG_KEY)) {
    document.getElementById('config-panel').open = true;
  }

  // Listen for OAuth popup result via postMessage and BroadcastChannel
  window.addEventListener('message', handleOAuthMessage);
  try {
    const bc = new BroadcastChannel('oauth-callback');
    bc.onmessage = (event) => handleOAuthResult(event.data);
  } catch(e) {}

  // Load current step state from server
  await refreshState();

  // Bind buttons (4 steps)
  document.getElementById('btn-step-1').addEventListener('click', doStep1);
  document.getElementById('btn-step-2').addEventListener('click', () => doStep(2));
  document.getElementById('btn-step-3').addEventListener('click', () => doStep(3));
  document.getElementById('btn-step-4').addEventListener('click', doStep4);
  document.getElementById('reset-btn').addEventListener('click', doReset);

  // Step 4: API test config - update curl when inputs change
  document.getElementById('api-method')?.addEventListener('change', updateCurlCommands);
  document.getElementById('api-url')?.addEventListener('input', updateCurlCommands);
  document.getElementById('api-body')?.addEventListener('input', updateCurlCommands);
  document.getElementById('view-logs-btn').addEventListener('click', () => {
    window.open('/log-viewer.html', '_blank');
  });

  // Use Existing token feature
  document.getElementById('use-existing-btn').addEventListener('click', showUseExistingPanel);
  document.getElementById('set-access-token-btn').addEventListener('click', () => setExistingToken('access_token'));
  document.getElementById('set-id-token-btn').addEventListener('click', () => setExistingToken('id_token'));
  document.getElementById('cancel-existing-btn').addEventListener('click', hideUseExistingPanel);

  // Regenerate cURL links for each step
  document.getElementById('regenerate-curl-2')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('curl-2')?.classList.remove('curl-actual');
    cachedStep2JwtParams = null;
    updateCurlCommands();
  });

  document.getElementById('regenerate-curl-3')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('curl-3')?.classList.remove('curl-actual');
    updateCurlCommands();
  });

  document.getElementById('regenerate-curl-4')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('curl-4')?.classList.remove('curl-actual');
    updateCurlCommands();
  });

  // Initialize parameter details modal
  initParamModal();

  document.getElementById('save-config-btn').addEventListener('click', saveToBrowser);
  document.getElementById('save-server-btn').addEventListener('click', saveToServer);
  document.getElementById('clear-config-btn').addEventListener('click', clearConfig);
  document.getElementById('load-saved-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openConfigsModal();
  });
  document.getElementById('close-modal-btn').addEventListener('click', closeConfigsModal);
  document.getElementById('configs-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfigsModal();
  });

  // Redirect URI mode toggle
  const redirectModeEl = document.getElementById('cfg-redirectUriMode');
  redirectModeEl.addEventListener('change', updateRedirectUriMode);
  updateRedirectUriMode();

  // Okta domain auto-correct (remove -admin from admin URLs)
  setupOktaDomainAutoCorrect();

  // Update cURL commands when config inputs change
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) el.addEventListener('input', updateCurlCommands);
  }
  redirectModeEl.addEventListener('change', updateCurlCommands);

  // Step 1 options: auth server picker with alternate option
  const step1AuthServer = document.getElementById('step1-auth-server');
  const step1AlternateInput = document.getElementById('step1-alternate-server');
  if (step1AuthServer) {
    step1AuthServer.addEventListener('change', () => {
      // Show/hide alternate input based on selection
      if (step1AlternateInput) {
        step1AlternateInput.hidden = step1AuthServer.value !== 'alternate';
      }
      updateCustomAuthServerLabel('step1-auth-server', document.getElementById('cfg-authorizationServerId')?.value || '');
      updateCurlCommands();
    });
  }
  if (step1AlternateInput) {
    step1AlternateInput.addEventListener('input', () => {
      updateAlternateAuthServerLabel('step1-auth-server', step1AlternateInput.value);
      updateCurlCommands();
    });
  }

  // Step 2 options: auth server picker and subject token type
  // Invalidate JWT cache and regenerate when pickers change
  const step2AuthServer = document.getElementById('step2-auth-server');
  const step2SubjectTokenType = document.getElementById('step2-subject-token-type');
  if (step2AuthServer) {
    step2AuthServer.addEventListener('change', () => {
      cachedStep2JwtParams = null; // Invalidate cache to regenerate JWT
      // Remove curl-actual class so curl can be updated even after submission
      document.getElementById('curl-2')?.classList.remove('curl-actual');
      updateCurlCommands();
    });
  }
  if (step2SubjectTokenType) {
    step2SubjectTokenType.addEventListener('change', () => {
      cachedStep2JwtParams = null; // Invalidate cache to regenerate JWT
      // Remove curl-actual class so curl can be updated even after submission
      document.getElementById('curl-2')?.classList.remove('curl-actual');
      updateCurlCommands();
    });
  }

  // Step 3 options: auth server picker with alternate option
  const step3AuthServer = document.getElementById('step3-auth-server');
  const step3AlternateInput = document.getElementById('step3-alternate-server');
  if (step3AuthServer) {
    step3AuthServer.addEventListener('change', () => {
      // Show/hide alternate input based on selection
      if (step3AlternateInput) {
        step3AlternateInput.hidden = step3AuthServer.value !== 'alternate';
      }
      // Remove curl-actual class so curl can be updated even after submission
      document.getElementById('curl-3')?.classList.remove('curl-actual');
      updateCustomAuthServerLabel('step3-auth-server', document.getElementById('cfg-authorizationServerId')?.value || '');
      updateCurlCommands();
    });
  }
  if (step3AlternateInput) {
    step3AlternateInput.addEventListener('input', () => {
      updateAlternateAuthServerLabel('step3-auth-server', step3AlternateInput.value);
      // Remove curl-actual class so curl can be updated even after submission
      document.getElementById('curl-3')?.classList.remove('curl-actual');
      updateCurlCommands();
    });
  }

  // Initialize custom auth server labels and update on change
  const authServerIdEl = document.getElementById('cfg-authorizationServerId');
  if (authServerIdEl) {
    updateCustomAuthServerLabel('step1-auth-server', authServerIdEl.value || '');
    updateCustomAuthServerLabel('step2-auth-server', authServerIdEl.value || '');
    updateCustomAuthServerLabel('step3-auth-server', authServerIdEl.value || '');
    authServerIdEl.addEventListener('input', () => {
      updateCustomAuthServerLabel('step1-auth-server', authServerIdEl.value || '');
      updateCustomAuthServerLabel('step2-auth-server', authServerIdEl.value || '');
      updateCustomAuthServerLabel('step3-auth-server', authServerIdEl.value || '');
      // Refresh scopes when auth server changes
      debouncedFetchScopes();
    });
  }

  // Initialize scope selector
  initScopeSelector();

  // Fetch scopes when okta domain changes
  const oktaDomainEl = document.getElementById('cfg-oktaDomain');
  if (oktaDomainEl) {
    oktaDomainEl.addEventListener('input', debouncedFetchScopes);
  }
}

// --- Redirect URI mode ---

function getRedirectUri() {
  const mode = document.getElementById('cfg-redirectUriMode').value;
  if (mode === 'thisApp') {
    return `${window.location.origin}/callback`;
  }
  return document.getElementById('cfg-redirectUri').value.trim();
}

function updateRedirectUriMode() {
  const mode = document.getElementById('cfg-redirectUriMode').value;
  const inputEl = document.getElementById('cfg-redirectUri');
  const previewEl = document.getElementById('redirect-uri-preview');
  if (mode === 'thisApp') {
    inputEl.hidden = true;
    previewEl.textContent = `${window.location.origin}/callback`;
  } else {
    inputEl.hidden = false;
    previewEl.textContent = '';
  }
}

// --- Scope Selector ---

let availableScopes = []; // Scopes from well-known endpoint
let selectedScopes = new Set(); // Currently selected scopes (both available and custom)
let customScopes = new Set(); // Custom scopes added by user
let fetchScopesTimeout = null;

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
  const authServerId = document.getElementById('cfg-authorizationServerId')?.value?.trim();
  if (oktaDomain && authServerId) {
    fetchScopes();
  }
}

function debouncedFetchScopes() {
  if (fetchScopesTimeout) clearTimeout(fetchScopesTimeout);
  fetchScopesTimeout = setTimeout(fetchScopes, 500);
}

async function fetchScopes() {
  const oktaDomain = document.getElementById('cfg-oktaDomain')?.value?.trim();
  const authServerId = document.getElementById('cfg-authorizationServerId')?.value?.trim();
  const loadingEl = document.getElementById('scope-loading');
  const tilesEl = document.getElementById('scope-tiles');

  if (!oktaDomain || !authServerId) {
    if (loadingEl) loadingEl.textContent = 'Configure Okta Domain and Auth Server ID to load scopes';
    if (loadingEl) loadingEl.style.display = '';
    availableScopes = [];
    renderScopeTiles();
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
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    availableScopes = data.scopes_supported || [];

    if (loadingEl) loadingEl.style.display = 'none';
    renderScopeTiles();
  } catch (err) {
    console.error('Failed to fetch scopes:', err);
    if (loadingEl) {
      loadingEl.textContent = 'Could not load scopes from authorization server';
      loadingEl.style.display = '';
    }
    availableScopes = [];
    renderScopeTiles();
  }
}

// Standard OAuth scopes (shown last, colored yellow)
const STANDARD_SCOPES = new Set([
  'interclient_access',
  'openid',
  'profile',
  'email',
  'address',
  'phone',
  'offline_access',
  'device_sso'
]);

function isStandardScope(scope) {
  return STANDARD_SCOPES.has(scope);
}

function renderScopeTiles() {
  const tilesEl = document.getElementById('scope-tiles');
  const loadingEl = document.getElementById('scope-loading');
  if (!tilesEl) return;

  // Sort available scopes: non-standard first, then standard
  const sortedScopes = [...availableScopes].sort((a, b) => {
    const aStandard = isStandardScope(a);
    const bStandard = isStandardScope(b);
    if (aStandard && !bStandard) return 1;  // a goes after b
    if (!aStandard && bStandard) return -1; // a goes before b
    return a.localeCompare(b); // alphabetical within each group
  });

  // Build tiles HTML
  let tilesHtml = '';

  // Render available scopes from well-known (sorted)
  for (const scope of sortedScopes) {
    const isSelected = selectedScopes.has(scope);
    const isStandard = isStandardScope(scope);
    const cls = (isSelected ? 'scope-tile selected' : 'scope-tile available') + (isStandard ? ' standard' : '');
    tilesHtml += `<span class="${cls}" data-scope="${escapeAttr(scope)}" onclick="toggleScope('${escapeAttr(scope)}')">${escapeHtml(scope)}</span>`;
  }

  // Render custom scopes (always selected, with remove button)
  for (const scope of customScopes) {
    // Don't show if it's also in available scopes (it would be shown above)
    if (availableScopes.includes(scope)) continue;
    tilesHtml += `<span class="scope-tile custom" data-scope="${escapeAttr(scope)}">${escapeHtml(scope)}<span class="scope-remove" onclick="removeCustomScope('${escapeAttr(scope)}')">&times;</span></span>`;
  }

  // Clear and rebuild the tiles container
  tilesEl.innerHTML = '';

  // Show loading message if no scopes available, otherwise show tiles
  if (loadingEl) {
    tilesEl.appendChild(loadingEl);
    if (tilesHtml) {
      loadingEl.style.display = 'none';
    } else {
      loadingEl.style.display = '';
    }
  }

  // Append scope tiles
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

  // Don't add duplicates
  if (customScopes.has(scope) || (availableScopes.includes(scope) && selectedScopes.has(scope))) {
    inputEl.value = '';
    return;
  }

  // If it's an available scope, just select it
  if (availableScopes.includes(scope)) {
    selectedScopes.add(scope);
  } else {
    // Add as custom scope
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
  const hiddenEl = document.getElementById('cfg-tokenExchangeScope');
  if (hiddenEl) {
    // Combine selected available scopes and custom scopes
    const allSelected = Array.from(selectedScopes);
    hiddenEl.value = allSelected.join(' ');
  }
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Expose toggle functions to onclick handlers
window.toggleScope = toggleScope;
window.removeCustomScope = removeCustomScope;

// --- Config management ---

function getConfig() {
  const cfg = {};
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) cfg[field] = el.value.trim();
  }
  cfg.redirectUri = getRedirectUri();
  if (cfg.privateJwk) {
    try {
      cfg.privateJwk = JSON.parse(cfg.privateJwk);
    } catch {
      // Leave as string, backend will validate
    }
  }
  return cfg;
}

function getConfigRaw() {
  const cfg = {};
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) cfg[field] = el.value.trim();
  }
  cfg.redirectUri = getRedirectUri();
  return cfg;
}

function loadConfigFromStorage() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (!saved) return;
    const cfg = JSON.parse(saved);
    for (const field of CONFIG_FIELDS) {
      if (cfg[field] !== undefined) {
        const el = document.getElementById(`cfg-${field}`);
        if (!el) continue;
        if (field === 'privateJwk' && typeof cfg[field] === 'object') {
          el.value = JSON.stringify(cfg[field], null, 2);
        } else if (field === 'tokenExchangeScope') {
          // Restore scope state
          el.value = cfg[field];
          restoreScopesFromString(cfg[field], cfg.customScopes || []);
        } else {
          el.value = cfg[field];
        }
      }
    }
    // Restore custom scopes if saved
    if (cfg.customScopes) {
      customScopes = new Set(cfg.customScopes);
    }
    if (cfg.redirectUriMode) {
      document.getElementById('cfg-redirectUriMode').value = cfg.redirectUriMode;
    }
    updateRedirectUriMode();
  } catch {
    // Ignore parse errors
  }
}

function restoreScopesFromString(scopeString, customScopesList) {
  if (!scopeString) {
    selectedScopes = new Set();
    customScopes = new Set(customScopesList || []);
    return;
  }
  const scopes = scopeString.split(/\s+/).filter(s => s);
  selectedScopes = new Set(scopes);
  customScopes = new Set(customScopesList || []);
}

async function saveToBrowser() {
  const name = await dialogPrompt('Enter a name for this configuration:', '', 'Save to Browser');
  if (name === null) return; // cancelled
  saveConfig(name || 'Untitled');
  await dialogAlert(`Configuration saved to browser as "${name || 'Untitled'}"`, 'Saved');
}

function saveConfig(configName = null) {
  const cfg = {};
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (!el) continue;
    const val = el.value.trim();
    if (field === 'privateJwk') {
      try {
        cfg[field] = JSON.parse(val);
      } catch {
        cfg[field] = val;
      }
    } else {
      cfg[field] = val;
    }
  }
  cfg.redirectUriMode = document.getElementById('cfg-redirectUriMode').value;
  // Save custom scopes separately so we can restore them
  cfg.customScopes = Array.from(customScopes);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));

  // Save metadata about the save (browser only)
  const meta = {
    name: configName || 'Unsaved',
    source: 'browser',
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(CONFIG_META_KEY, JSON.stringify(meta));
  updateConfigStatus();
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(CONFIG_META_KEY);
  for (const field of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${field}`);
    if (el) el.value = '';
  }
  const noteEl = document.getElementById('cfg-note');
  if (noteEl) noteEl.value = '';
  document.getElementById('cfg-redirectUriMode').value = 'thisApp';
  updateRedirectUriMode();
  // Reset scope selector
  selectedScopes = new Set();
  customScopes = new Set();
  availableScopes = [];
  const loadingEl = document.getElementById('scope-loading');
  if (loadingEl) {
    loadingEl.textContent = 'Configure Okta Domain and Auth Server ID to load scopes';
    loadingEl.style.display = '';
  }
  renderScopeTiles();
  updateConfigStatus();
  updateCurlCommands();
}

function updateConfigStatus() {
  const statusEl = document.getElementById('config-status');
  const saved = localStorage.getItem(CONFIG_KEY);
  const metaJson = localStorage.getItem(CONFIG_META_KEY);

  if (saved && metaJson) {
    try {
      const meta = JSON.parse(metaJson);
      const name = meta.name || 'Untitled';
      if (meta.source === 'server') {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(name)}</span>`;
        statusEl.className = 'config-status saved';
      } else {
        statusEl.innerHTML = `<span class="config-name">${escapeHtml(name)}</span> <span class="config-badge-browser">browser storage</span>`;
        statusEl.className = 'config-status saved';
      }
    } catch {
      statusEl.textContent = '(saved)';
      statusEl.className = 'config-status saved';
    }
  } else if (saved) {
    statusEl.innerHTML = '<span class="config-badge-browser">browser storage</span>';
    statusEl.className = 'config-status saved';
  } else {
    statusEl.textContent = '(not saved)';
    statusEl.className = 'config-status';
  }
}

// --- Dialog utilities (replaces alert/prompt/confirm) ---

function showDialog({ title, message, input, defaultValue, showCancel }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-modal');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const inputEl = document.getElementById('dialog-input');
    const cancelBtn = document.getElementById('dialog-cancel');
    const okBtn = document.getElementById('dialog-ok');

    titleEl.textContent = title || 'Message';
    msgEl.textContent = message || '';
    inputEl.hidden = !input;
    inputEl.value = defaultValue || '';
    cancelBtn.hidden = !showCancel;
    overlay.hidden = false;

    if (input) inputEl.focus();

    function cleanup() {
      overlay.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      inputEl.removeEventListener('keydown', onKey);
    }

    function onOk() {
      cleanup();
      resolve(input ? inputEl.value : true);
    }
    function onCancel() {
      cleanup();
      resolve(input ? null : false);
    }
    function onOverlay(e) {
      if (e.target === overlay) onCancel();
    }
    function onKey(e) {
      if (e.key === 'Enter') onOk();
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    if (input) inputEl.addEventListener('keydown', onKey);
  });
}

function dialogAlert(message, title) {
  return showDialog({ title: title || 'Notice', message });
}

function dialogPrompt(message, defaultValue, title) {
  return showDialog({ title: title || 'Input', message, input: true, defaultValue, showCancel: true });
}

function dialogConfirm(message, title) {
  return showDialog({ title: title || 'Confirm', message, showCancel: true });
}

// --- Server config management ---

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
      // Only default to overwrite if it's a server config AND current user is the creator
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
      // If no configs exist, force "Save as New" mode
      modeRadios.forEach(r => r.checked = r.value === 'new');
      newFieldEl.hidden = false;
      overwriteFieldEl.hidden = true;
    } else {
      existingEl.innerHTML = configs.map(c => {
        const date = new Date(c.updatedAt).toLocaleDateString();
        return `<option value="${c.id}">${escapeHtml(c.name)} (${date})</option>`;
      }).join('');

      // Pre-select the current config if defaulting to overwrite
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
        if (!name) return; // require name
        cleanup();
        resolve({ mode: 'new', name });
      } else {
        const id = existingEl.value;
        if (!id) return; // require selection
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

  const noteEl = document.getElementById('cfg-note');
  const note = noteEl ? noteEl.value.trim() : '';
  const creator = getCurrentUserSub();

  const cfg = getConfig();
  cfg.redirectUriMode = document.getElementById('cfg-redirectUriMode').value;
  // Include custom scopes so they can be restored when loading
  cfg.customScopes = Array.from(customScopes);

  try {
    if (result.mode === 'new') {
      // Create new configuration
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.name, creator, note, configurationType: CONFIG_TYPE, config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update local storage with server save metadata (include creator for save modal logic)
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
        name: result.name,
        source: 'server',
        serverId: data.id,
        creator: creator,
        savedAt: new Date().toISOString(),
      }));
      updateConfigStatus();

      await dialogAlert(`Configuration saved as "${result.name}"`, 'Saved');
    } else {
      // Overwrite existing configuration
      const res = await fetch(`/api/configs/${result.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update local storage with server save metadata (preserve creator from existing metadata)
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

      await dialogAlert(`Configuration "${result.name}" updated`, 'Updated');
    }
  } catch (err) {
    await dialogAlert(`Error saving: ${err.message}`, 'Error');
  }
}

async function openConfigsModal() {
  const modal = document.getElementById('configs-modal');
  const listEl = document.getElementById('configs-list');
  modal.hidden = false;
  listEl.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res = await fetch('/api/configs');
    const allConfigs = await res.json();

    // Filter to only show configs for this flow type
    const configs = allConfigs.filter(c => c.configurationType === CONFIG_TYPE);

    if (configs.length === 0) {
      listEl.innerHTML = '<div class="config-list-empty">No saved configurations for this flow.</div>';
      return;
    }

    const currentUserSub = getCurrentUserSub();
    listEl.innerHTML = configs.map((c) => {
      const date = new Date(c.updatedAt).toLocaleDateString();
      const canDelete = c.creator === currentUserSub;
      const noteHtml = c.note ? `<div class="config-item-note">${escapeHtml(c.note)}</div>` : '';
      return `
        <div class="config-item">
          <div class="config-item-info">
            <div class="config-item-name">${escapeHtml(c.name)}</div>
            <div class="config-item-meta">by ${escapeHtml(c.creator)} &middot; ${date}</div>
            ${noteHtml}
          </div>
          <div class="config-item-actions">
            <button class="btn-load" onclick="loadServerConfig('${c.id}')">Load</button>
            ${canDelete ? `<button class="btn-delete" onclick="deleteServerConfig('${c.id}')">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
  }
}

function closeConfigsModal() {
  document.getElementById('configs-modal').hidden = true;
}

async function loadServerConfig(id) {
  try {
    const res = await fetch(`/api/configs/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const cfg = data.config;
    for (const field of CONFIG_FIELDS) {
      if (cfg[field] !== undefined) {
        const el = document.getElementById(`cfg-${field}`);
        if (!el) continue;
        if (field === 'privateJwk' && typeof cfg[field] === 'object') {
          el.value = JSON.stringify(cfg[field], null, 2);
        } else {
          el.value = cfg[field];
        }
      }
    }

    document.getElementById('cfg-redirectUriMode').value = cfg.redirectUriMode || 'thisApp';
    updateRedirectUriMode();

    // Restore scope state
    restoreScopesFromString(cfg.tokenExchangeScope || '', cfg.customScopes || []);
    // Fetch available scopes and then render
    await fetchScopes();

    const noteEl = document.getElementById('cfg-note');
    if (noteEl) noteEl.value = data.note || '';

    // Save to local storage with server metadata (include creator for save modal logic)
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    localStorage.setItem(CONFIG_META_KEY, JSON.stringify({
      name: data.name,
      source: 'server',
      serverId: id,
      creator: data.creator,
      savedAt: new Date().toISOString(),
    }));
    updateConfigStatus();

    updateCurlCommands();
    closeConfigsModal();
  } catch (err) {
    await dialogAlert(`Error loading: ${err.message}`, 'Error');
  }
}

async function deleteServerConfig(id) {
  const confirmed = await dialogConfirm('Delete this configuration?', 'Delete');
  if (!confirmed) return;
  const creator = getCurrentUserSub();
  try {
    const res = await fetch(`/api/configs/${id}?creator=${encodeURIComponent(creator)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    openConfigsModal(); // Refresh the list
  } catch (err) {
    await dialogAlert(`Error deleting: ${err.message}`, 'Error');
  }
}

// Expose to inline onclick handlers
window.loadServerConfig = loadServerConfig;
window.deleteServerConfig = deleteServerConfig;

// --- cURL command generation ---

async function updateCurlCommands() {
  const c = getConfigRaw();
  const domain = c.oktaDomain || '<MISSING-CONFIG>';
  const clientId = c.clientId || '<MISSING-CONFIG>';
  const clientSecret = c.clientSecret || '<MISSING-CONFIG>';
  const redirectUri = c.redirectUri || '<MISSING-CONFIG>';
  const principalId = c.principalId || '<MISSING-CONFIG>';
  const authServerId = c.authorizationServerId || '<MISSING-CONFIG>';
  const tokenExchangeScope = c.tokenExchangeScope?.trim() || '';

  // Get curl elements
  const curl1Auth = document.getElementById('curl-1-authorize');
  const curl1Token = document.getElementById('curl-1-token');
  const curl2 = document.getElementById('curl-2');
  const curl3 = document.getElementById('curl-3');

  // Get Step 1 auth server path
  const step1AlternateId = document.getElementById('step1-alternate-server')?.value?.trim() || '';
  const step1AuthPath = getStepAuthServerPath('step1-auth-server', authServerId, step1AlternateId);

  // Step 1: Authorize URL
  // Only update if not already showing actual curl
  if (curl1Auth && !curl1Auth.classList.contains('curl-actual')) {
    curl1Auth.innerHTML =
      `<span class="curl-comment"># Browser redirect (not a cURL call)</span>\n` +
      `<span class="curl-cmd">GET</span> <span class="curl-url">${esc(domain)}/${esc(step1AuthPath)}/authorize</span>\n` +
      `  <span class="curl-flag">?client_id=</span><span class="curl-data">${esc(clientId)}</span>\n` +
      `  <span class="curl-flag">&response_type=</span><span class="curl-data">code</span>\n` +
      `  <span class="curl-flag">&scope=</span><span class="curl-data">openid profile email</span>\n` +
      `  <span class="curl-flag">&redirect_uri=</span><span class="curl-data">${esc(redirectUri)}</span>\n` +
      `  <span class="curl-flag">&state=</span><span class="curl-data">{random}</span>\n` +
      `  <span class="curl-flag">&nonce=</span><span class="curl-data">{random}</span>`;
  }

  // Step 1: Token exchange (auth code for tokens)
  if (curl1Token && !curl1Token.classList.contains('curl-actual')) {
    curl1Token.innerHTML =
      `<span class="curl-cmd">curl</span> <span class="curl-flag">-X POST</span> <span class="curl-url">${esc(domain)}/${esc(step1AuthPath)}/token</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-H</span> <span class="curl-data">"Content-Type: application/x-www-form-urlencoded"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"grant_type=authorization_code</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&client_id=${esc(clientId)}</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&client_secret=${esc(clientSecret)}</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&redirect_uri=${esc(redirectUri)}</span> <span class="curl-flag">\\</span>\n` +
      `      <span class="curl-data">&code={AUTHORIZATION_CODE}"</span>`;
  }

  // Step 2: Token Exchange (RFC 8693) - Exchange token for ID-JAG
  // Only update if not already showing actual curl
  if (curl2 && !curl2.classList.contains('curl-actual')) {
    // Get auth server path from picker (Step 2 doesn't have alternate option)
    const step2AuthPath = getStepAuthServerPath('step2-auth-server', authServerId, '');
    const step2TokenEndpoint = `${domain}/${step2AuthPath}/token`;

    // Get subject token type from picker
    const subjectTokenTypeEl = document.getElementById('step2-subject-token-type');
    const subjectTokenType = subjectTokenTypeEl ? subjectTokenTypeEl.value : 'access_token';
    const subjectTokenTypeUrn = `urn:ietf:params:oauth:token-type:${subjectTokenType}`;

    // Get the appropriate token based on subject token type
    const subjectToken = subjectTokenType === 'id_token'
      ? (tokens.idToken || '<MISSING-ID-TOKEN>')
      : (tokens.accessToken || '<MISSING-ACCESS-TOKEN>');

    const step2Audience = `${domain}/oauth2/${authServerId}`;

    // Parse private JWK and generate client assertion
    let privateJwk = null;
    try {
      const jwkStr = c.privateJwk;
      if (jwkStr) {
        privateJwk = typeof jwkStr === 'string' ? JSON.parse(jwkStr) : jwkStr;
      }
    } catch (e) {
      // Invalid JSON
    }

    // Generate client assertion JWT (async)
    const clientAssertion = await getStep2ClientAssertion(privateJwk, c.principalId, step2TokenEndpoint);

    // Use configured scope or 'null' if none selected
    const scopeValue = tokenExchangeScope || 'null';
    const scopeLine = `  <span class="curl-flag">-d</span> <span class="curl-data">"scope=${esc(scopeValue)}"</span> <span class="curl-flag">\\</span>\n`;

    curl2.innerHTML =
      `<span class="curl-comment"># Actor: AI Agent — RFC 8693 Token Exchange</span>\n` +
      `<span class="curl-comment"># Exchange user's ${subjectTokenType} for ID-JAG token</span>\n` +
      `<span class="curl-cmd">curl</span> <span class="curl-flag">--request POST</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">--url</span> <span class="curl-url">${esc(step2TokenEndpoint)}</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-H</span> <span class="curl-data">"Content-Type: application/x-www-form-urlencoded"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"grant_type=urn:ietf:params:oauth:grant-type:token-exchange"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"subject_token=${esc(subjectToken)}"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"subject_token_type=${esc(subjectTokenTypeUrn)}"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"requested_token_type=urn:ietf:params:oauth:token-type:id-jag"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"audience=${esc(step2Audience)}"</span> <span class="curl-flag">\\</span>\n` +
      scopeLine +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"client_assertion=${esc(clientAssertion)}"</span>`;

    // Update custom auth server label
    updateCustomAuthServerLabel('step2-auth-server', authServerId);
  }

  // Step 3: JWT Bearer Grant (RFC 7523) - Exchange ID-JAG for Auth Server access token
  // Only update if not already showing actual curl
  if (curl3 && !curl3.classList.contains('curl-actual')) {
    const idJagTokenDisplay = tokens.idJagToken || '{ID_JAG_TOKEN}';

    // Get Step 3 auth server path from picker
    const step3AlternateId = document.getElementById('step3-alternate-server')?.value?.trim() || '';
    const step3AuthPath = getStepAuthServerPath('step3-auth-server', authServerId, step3AlternateId);
    const tokenEndpoint3 = `${domain}/${step3AuthPath}/token`;

    curl3.innerHTML =
      `<span class="curl-comment"># Actor: AI Agent — RFC 7523 JWT Bearer Grant</span>\n` +
      `<span class="curl-comment"># Exchange ID-JAG for Authorization Server access token</span>\n` +
      `<span class="curl-cmd">curl</span> <span class="curl-flag">--request POST</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">--url</span> <span class="curl-url">${esc(tokenEndpoint3)}</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-H</span> <span class="curl-data">"Content-Type: application/x-www-form-urlencoded"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"assertion=${esc(idJagTokenDisplay)}"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-d</span> <span class="curl-data">"client_assertion={CLIENT_ASSERTION_JWT}"</span>\n\n` +
      `<span class="curl-comment"># Client Assertion JWT payload (signed with Private JWK):</span>\n` +
      `<span class="curl-comment">#   iss: ${esc(principalId)}</span>\n` +
      `<span class="curl-comment">#   sub: ${esc(principalId)}</span>\n` +
      `<span class="curl-comment">#   aud: ${esc(tokenEndpoint3)}</span>\n` +
      `<span class="curl-comment">#   exp: {now + 60s}</span>\n` +
      `<span class="curl-comment">#   iat: {now}</span>\n` +
      `<span class="curl-comment">#   jti: {random UUID}</span>`;

    // Update custom auth server label
    updateCustomAuthServerLabel('step3-auth-server', authServerId);
  }

  // Step 4: Test Token with API
  const curl4 = document.getElementById('curl-4');
  if (curl4 && !curl4.classList.contains('curl-actual')) {
    const apiMethod = document.getElementById('api-method')?.value || 'GET';
    const apiUrl = document.getElementById('api-url')?.value?.trim() || '{API_URL}';
    const apiBody = document.getElementById('api-body')?.value?.trim() || '';
    const accessToken = tokens.authServerToken || '{ACCESS_TOKEN}';

    let curlContent =
      `<span class="curl-comment"># Test Access Token with API</span>\n` +
      `<span class="curl-cmd">curl</span> <span class="curl-flag">--request ${esc(apiMethod)}</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">--url</span> <span class="curl-url">"${esc(apiUrl)}"</span> <span class="curl-flag">\\</span>\n` +
      `  <span class="curl-flag">-H</span> <span class="curl-data">"Authorization: Bearer ${esc(accessToken)}"</span>`;

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(apiMethod) && apiBody) {
      curlContent += ` <span class="curl-flag">\\</span>\n` +
        `  <span class="curl-flag">-H</span> <span class="curl-data">"Content-Type: application/json"</span> <span class="curl-flag">\\</span>\n` +
        `  <span class="curl-flag">-d</span> <span class="curl-data">'${esc(apiBody)}'</span>`;
    }

    curl4.innerHTML = curlContent;
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Get the OAuth path for a step's auth server selector.
 * @param {string} stepId - The select element ID (e.g., 'step1-auth-server')
 * @param {string} customAuthServerId - The custom auth server ID from config
 * @param {string} alternateAuthServerId - The alternate auth server ID (for step 1)
 */
function getStepAuthServerPath(stepId, customAuthServerId, alternateAuthServerId) {
  const select = document.getElementById(stepId);
  if (!select) return 'oauth2/v1';

  const mode = select.value;
  if (mode === 'org') {
    return 'oauth2/v1';
  } else if (mode === 'default') {
    return 'oauth2/default/v1';
  } else if (mode === 'alternate') {
    const id = alternateAuthServerId || '{alternate}';
    return `oauth2/${id}/v1`;
  } else {
    // 'custom'
    const id = customAuthServerId || '{custom}';
    return `oauth2/${id}/v1`;
  }
}

/**
 * Get the auth server ID for a step's selection.
 */
function getStepAuthServerId(stepId, customAuthServerId, alternateAuthServerId) {
  const select = document.getElementById(stepId);
  if (!select) return '';

  const mode = select.value;
  if (mode === 'org') {
    return '';
  } else if (mode === 'default') {
    return 'default';
  } else if (mode === 'alternate') {
    return alternateAuthServerId || '';
  } else {
    // 'custom'
    return customAuthServerId || '';
  }
}

/**
 * Update the 'custom' option text in a step auth server selector.
 */
function updateCustomAuthServerLabel(stepId, customAuthServerId) {
  const select = document.getElementById(stepId);
  if (!select) return;

  const displayId = customAuthServerId || '{custom}';
  const customOption = select.querySelector('option[value="custom"]');
  if (customOption) {
    customOption.textContent = `oauth2/${displayId}/v1`;
  }
}

/**
 * Update the 'alternate' option text in a step auth server selector.
 */
function updateAlternateAuthServerLabel(stepId, alternateAuthServerId) {
  const select = document.getElementById(stepId);
  if (!select) return;

  const displayId = alternateAuthServerId || '{alternate}';
  const alternateOption = select.querySelector('option[value="alternate"]');
  if (alternateOption) {
    alternateOption.textContent = `oauth2/${displayId}/v1`;
  }
}

// --- Client-side JWT generation for curl preview ---

/**
 * Base64URL encode a buffer or string
 */
function b64u(input) {
  if (typeof input === 'string') {
    input = new TextEncoder().encode(input);
  }
  if (input instanceof ArrayBuffer) {
    input = new Uint8Array(input);
  }
  const arr = [];
  for (let i = 0; i < input.byteLength; i += 0x8000) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + 0x8000)));
  }
  return btoa(arr.join('')).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Generate a UUID v4
 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a client assertion JWT using Web Crypto API
 * @param {object} privateJwk - The private JWK for signing
 * @param {string} principalId - The principal ID (iss and sub)
 * @param {string} audience - The token endpoint URL (aud)
 * @returns {Promise<string>} The signed JWT
 */
async function generateClientAssertionJwt(privateJwk, principalId, audience) {
  if (!privateJwk || !privateJwk.d) {
    return '<MISSING-PRIVATE-KEY>';
  }
  if (!principalId) {
    return '<MISSING-PRINCIPAL-ID>';
  }

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign']
    );

    const now = Math.floor(Date.now() / 1000);
    const header = {
      kid: privateJwk.kid,
      alg: 'RS256'
    };
    const payload = {
      iss: principalId,
      sub: principalId,
      aud: audience,
      exp: now + 60,
      iat: now,
      jti: uuidv4()
    };

    const encoder = new TextEncoder();
    const head = b64u(JSON.stringify(header));
    const body = b64u(JSON.stringify(payload));
    const sig = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      key,
      encoder.encode(head + '.' + body)
    );

    return head + '.' + body + '.' + b64u(sig);
  } catch (err) {
    console.error('Failed to generate client assertion:', err);
    return '<JWT-GENERATION-FAILED>';
  }
}

// Cache for generated JWTs to avoid regenerating on every keystroke
let cachedStep2Jwt = null;
let cachedStep2JwtParams = null;

/**
 * Generate or return cached client assertion for Step 2
 */
async function getStep2ClientAssertion(privateJwk, principalId, tokenEndpoint) {
  const paramsKey = JSON.stringify({ kid: privateJwk?.kid, principalId, tokenEndpoint });

  // Return cached JWT if params haven't changed (except for time-sensitive regeneration)
  if (cachedStep2Jwt && cachedStep2JwtParams === paramsKey) {
    return cachedStep2Jwt;
  }

  cachedStep2Jwt = await generateClientAssertionJwt(privateJwk, principalId, tokenEndpoint);
  cachedStep2JwtParams = paramsKey;
  return cachedStep2Jwt;
}

/**
 * Force regenerate the Step 2 client assertion (called when Exchange button is pressed)
 */
async function regenerateStep2ClientAssertion() {
  cachedStep2JwtParams = null; // Invalidate cache
  await updateCurlCommands();
}

// --- State management ---

async function refreshState() {
  try {
    const res = await fetch('/api/steps/state');
    const state = await res.json();
    updateUI(state);
  } catch {
    // Server might not be ready
  }
}

function updateUI(state) {
  if (state.step1) {
    tokens.idToken = state.step1.idToken || null;
    tokens.accessToken = state.step1.accessToken || null;
    tokens.refreshToken = state.step1.refreshToken || null;
    markStep1Completed(state.step1.idTokenClaims);
    unlock(2);
  }
  if (state.step2) {
    tokens.idJagToken = state.step2.idJagToken || null;
    markCompleted(2, state.step2);
    unlock(3);
  }
  if (state.step3) {
    tokens.authServerToken = state.step3.authServerToken || null;
    markCompleted(3, state.step3);
    unlock(4);
  }
  updateCurlCommands();
}

// --- Step execution ---

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

// Track the OAuth popup poll timer so we can clear it on success
let oauthPollTimer = null;

// --- Use Existing Token Feature ---

function showUseExistingPanel(e) {
  e.preventDefault();

  // Hide the authZ picker, action group, and curl section
  const stepOption = document.querySelector('#step-1 .step-option');
  const curlSection = document.getElementById('step1-curl-section');
  const actionGroup = document.getElementById('step1-action-group');
  const useExistingPanel = document.getElementById('use-existing-panel');

  if (stepOption) stepOption.hidden = true;
  if (curlSection) curlSection.hidden = true;
  if (actionGroup) actionGroup.hidden = true;
  if (useExistingPanel) useExistingPanel.hidden = false;

  // Focus the textarea
  const textarea = document.getElementById('existing-token-input');
  if (textarea) textarea.focus();
}

function hideUseExistingPanel() {
  // Show the authZ picker, action group, and curl section again
  const stepOption = document.querySelector('#step-1 .step-option');
  const curlSection = document.getElementById('step1-curl-section');
  const actionGroup = document.getElementById('step1-action-group');
  const useExistingPanel = document.getElementById('use-existing-panel');

  if (stepOption) stepOption.hidden = false;
  if (curlSection) curlSection.hidden = false;
  if (actionGroup) actionGroup.hidden = false;
  if (useExistingPanel) useExistingPanel.hidden = true;

  // Clear the textarea
  const textarea = document.getElementById('existing-token-input');
  if (textarea) textarea.value = '';
}

async function setExistingToken(tokenType) {
  const textarea = document.getElementById('existing-token-input');
  const tokenValue = textarea?.value?.trim();

  if (!tokenValue) {
    await dialogAlert('Please paste a token value.', 'Missing Token');
    return;
  }

  // Store the token on the server so Step 2 can access it
  try {
    const res = await fetch('/api/steps/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenType: tokenType,
        token: tokenValue,
        userName: getCurrentUserName(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to store token');
    }
  } catch (err) {
    await dialogAlert(`Error: ${err.message}`, 'Failed');
    return;
  }

  // Set the token in client-side memory
  if (tokenType === 'access_token') {
    tokens.accessToken = tokenValue;
    tokens.idToken = null; // Clear the other token type
  } else {
    tokens.idToken = tokenValue;
    tokens.accessToken = null; // Clear the other token type
  }

  // Try to decode the token for display
  let claims = null;
  try {
    const parts = tokenValue.split('.');
    if (parts.length === 3) {
      claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    }
  } catch {
    // Not a valid JWT, that's okay
  }

  // Hide the panel and show completed state
  hideUseExistingPanel();

  // Mark step 1 as completed
  const stepEl = document.getElementById('step-1');
  stepEl.classList.remove('locked', 'error');
  stepEl.classList.add('completed');

  // Show result with the token button
  const resultEl = document.getElementById('result-1');
  const tokenLabel = tokenType === 'access_token' ? 'Access Token' : 'ID Token';
  const tokenKey = tokenType === 'access_token' ? 'accessToken' : 'idToken';

  const copyButtons = buildTokenCopyButtons([
    { label: tokenLabel, key: tokenKey, token: tokenValue },
  ], true);
  resultEl.innerHTML = `<div class="existing-token-note">Using existing ${tokenType}</div>` +
    copyButtons +
    `<div class="token-display-area" id="step1-token-display" hidden></div>`;
  resultEl.classList.add('visible');
  bindStep1CopyButtons(resultEl);

  // Unlock step 2
  unlock(2);

  // Update Step 2 subject token type picker to match the token we just set
  const step2SubjectTokenType = document.getElementById('step2-subject-token-type');
  if (step2SubjectTokenType) {
    step2SubjectTokenType.value = tokenType;
  }

  // Invalidate JWT cache and update curl commands
  cachedStep2JwtParams = null;
  await updateCurlCommands();
}

async function doStep1() {
  saveConfig();
  const cfg = getConfig();
  cfg.sessionType = 'agentic-token-exchange';
  cfg.userName = getCurrentUserName();

  // Get Step 1 auth server selection
  const step1AuthServerEl = document.getElementById('step1-auth-server');
  const step1AlternateEl = document.getElementById('step1-alternate-server');
  const step1AuthServer = step1AuthServerEl?.value || 'org';

  // Determine the authorizationServerId for Step 1 based on picker
  if (step1AuthServer === 'org') {
    cfg.step1AuthServerId = '';
  } else if (step1AuthServer === 'default') {
    cfg.step1AuthServerId = 'default';
  } else if (step1AuthServer === 'alternate') {
    cfg.step1AuthServerId = step1AlternateEl?.value?.trim() || '';
  } else {
    // 'custom' - use the configured authorizationServerId
    cfg.step1AuthServerId = cfg.authorizationServerId || '';
  }

  showLoading(1);
  try {
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

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
    oauthPollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(oauthPollTimer);
        oauthPollTimer = null;
        // Check if step 1 completed (has 'completed' class)
        const stepEl = document.getElementById('step-1');
        if (!stepEl.classList.contains('completed')) {
          showError(1, 'Login window was closed before completing.');
        }
      }
    }, 500);
  } catch (err) {
    showError(1, err.message);
  }
}

function handleOAuthMessage(event) {
  if (event.origin !== window.location.origin) return;
  handleOAuthResult(event.data);
}

function handleOAuthResult(data) {
  if (!data || data.type !== 'oauth-callback') return;

  // Clear the poll timer immediately to prevent race condition
  if (oauthPollTimer) {
    clearInterval(oauthPollTimer);
    oauthPollTimer = null;
  }

  if (data.error) {
    showError(1, data.error, data.logTimestamp);
  } else if (data.success) {
    tokens.idToken = data.idToken || null;
    tokens.accessToken = data.accessToken || null;
    tokens.refreshToken = data.refreshToken || null;
    if (data.curl) {
      showActualCurl('curl-1-token', data.curl);
    }
    markStep1Completed(data.claims);
    unlock(2);
    updateCurlCommands();
  }
}

async function doStep(step) {
  saveConfig();
  const cfg = getConfig();
  cfg.sessionType = 'agentic-token-exchange';

  // Add step 2 specific options
  if (step === 2) {
    // Auth server selection
    const step2AuthEl = document.getElementById('step2-auth-server');
    if (step2AuthEl) {
      cfg.step2AuthServer = step2AuthEl.value;
    }
    // Subject token type selection
    const subjectTokenTypeEl = document.getElementById('step2-subject-token-type');
    if (subjectTokenTypeEl) {
      cfg.subjectTokenType = subjectTokenTypeEl.value;
    }
    // Invalidate JWT cache and regenerate for fresh timestamp
    cachedStep2JwtParams = null;
    await updateCurlCommands();
  }

  // Add step 3 specific options
  if (step === 3) {
    const step3AuthEl = document.getElementById('step3-auth-server');
    const step3AlternateEl = document.getElementById('step3-alternate-server');
    if (step3AuthEl) {
      cfg.step3AuthServer = step3AuthEl.value;
      if (step3AuthEl.value === 'alternate') {
        cfg.step3AuthServerId = step3AlternateEl?.value?.trim() || '';
      }
    }
  }

  showLoading(step);
  try {
    // Use agentic-specific endpoint
    const res = await fetch(`/api/steps/agentic/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cfg }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(step, data.error || 'Request failed', data.logTimestamp);
      return;
    }

    // Capture raw tokens for cURL display
    if (step === 2 && data.idJagToken) tokens.idJagToken = data.idJagToken;
    if (step === 3 && data.authServerToken) tokens.authServerToken = data.authServerToken;

    // Update cURL with actual command that was sent
    if (data.curl) {
      const curlId = `curl-${step}`;
      showActualCurl(curlId, data.curl);
    }

    markCompleted(step, data);
    if (step < 4) unlock(step + 1);
    updateCurlCommands();
  } catch (err) {
    showError(step, err.message);
  }
}

async function doStep4() {
  const apiMethod = document.getElementById('api-method')?.value || 'GET';
  const apiUrl = document.getElementById('api-url')?.value?.trim();
  const apiBody = document.getElementById('api-body')?.value?.trim() || '';

  if (!apiUrl) {
    await dialogAlert('Please enter an API URL to test.', 'Missing URL');
    return;
  }

  if (!tokens.authServerToken) {
    await dialogAlert('No access token available. Complete Step 3 first.', 'Missing Token');
    return;
  }

  showLoading(4);
  try {
    const res = await fetch('/api/steps/agentic/4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: apiMethod,
        url: apiUrl,
        body: apiBody,
        accessToken: tokens.authServerToken,
      }),
    });
    const data = await res.json();

    if (data.curl) {
      showActualCurl('curl-4', data.curl);
    }

    if (!res.ok) {
      // Still show the response even if error status
      if (data.apiResponse) {
        showStep4Result(data, false);
      } else {
        showError(4, data.error || 'Request failed', data.logTimestamp);
      }
      return;
    }

    showStep4Result(data, true);
  } catch (err) {
    showError(4, err.message);
  }
}

function showStep4Result(data, success) {
  const stepEl = document.getElementById('step-4');
  stepEl.classList.remove('locked', 'error');
  if (success) {
    stepEl.classList.add('completed');
  } else {
    stepEl.classList.add('error');
  }

  const resultEl = document.getElementById('result-4');
  const statusClass = data.apiStatus >= 200 && data.apiStatus < 300 ? 'status-success' : 'status-error';
  const statusLabel = success ? '<span class="success-indicator">Success!</span> ' : '';

  let responseDisplay = '';
  if (data.apiResponse) {
    try {
      // Try to format as JSON
      const formatted = typeof data.apiResponse === 'string'
        ? JSON.parse(data.apiResponse)
        : data.apiResponse;
      responseDisplay = formatJSON(formatted);
    } catch {
      responseDisplay = escapeHtml(typeof data.apiResponse === 'string' ? data.apiResponse : JSON.stringify(data.apiResponse));
    }
  }

  resultEl.innerHTML = `
    <div class="api-response-header">
      ${statusLabel}<span class="api-status ${statusClass}">HTTP ${data.apiStatus}</span>
    </div>
    <div class="result-box">${responseDisplay || '(empty response)'}</div>
  `;
  resultEl.classList.add('visible');
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
  tokens.idJagToken = null;
  tokens.authServerToken = null;
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    stepEl.classList.remove('completed', 'error');
    if (i > 1) stepEl.classList.add('locked');
    const btn = document.getElementById(`btn-step-${i}`);
    if (i > 1) btn.disabled = true;
    hideResult(i);
  }
  // Restore Step 1 UI (in case "Use Existing" panel was shown)
  hideUseExistingPanel();
  // Clear curl-actual class so templates can be shown again
  document.querySelectorAll('.curl-actual').forEach(el => el.classList.remove('curl-actual'));
  updateCurlCommands();
}

// --- UI helpers ---

function unlock(step) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.remove('locked');
  document.getElementById(`btn-step-${step}`).disabled = false;
}

function markCompleted(step, data) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.remove('locked', 'error');
  stepEl.classList.add('completed');
  showResult(step, data);
}

function markStep1Completed(claims) {
  const stepEl = document.getElementById('step-1');
  stepEl.classList.remove('locked', 'error');
  stepEl.classList.add('completed');

  const resultEl = document.getElementById('result-1');
  const copyButtons = buildTokenCopyButtons([
    { label: 'ID Token', key: 'idToken', token: tokens.idToken },
    { label: 'Access Token', key: 'accessToken', token: tokens.accessToken },
    { label: 'Refresh Token', key: 'refreshToken', token: tokens.refreshToken },
  ], true); // showLabel = true for Step 1
  // Token display area is hidden by default, shown when button is clicked
  resultEl.innerHTML = copyButtons + `<div class="token-display-area" id="step1-token-display" hidden></div>`;
  resultEl.classList.add('visible');
  bindStep1CopyButtons(resultEl);
}

function buildTokenCopyButtons(items, showLabel = false) {
  const available = items.filter(item => item.token);
  if (!available.length) return '';
  const label = showLabel ? '<span class="token-copy-label"><span class="success-indicator">Success!</span> display and copy to clipboard:</span>' : '';
  const buttons = available.map(item =>
    `<button class="btn-copy-token" data-token-key="${item.key}" title="Copy ${item.label} to clipboard">${item.label}</button>`
  ).join('');
  return `<div class="token-copy-bar">${label}${buttons}</div>`;
}

function bindCopyButtons(container) {
  container.querySelectorAll('.btn-copy-token').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tokenKey;
      const token = tokens[key];
      if (!token) return;
      try {
        await navigator.clipboard.writeText(token);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = token;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
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
 * Bind Step 1 token buttons to copy and toggle display of decoded token
 */
function bindStep1CopyButtons(container) {
  const displayArea = document.getElementById('step1-token-display');
  let currentlyDisplayedKey = null;

  container.querySelectorAll('.btn-copy-token').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tokenKey;
      const token = tokens[key];
      if (!token) return;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(token);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = token;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

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
        displayArea.innerHTML = `<div class="result-box">${formatJSON(decoded)}</div>`;
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
 * Decode a JWT token for display, or return info for opaque tokens
 */
function decodeTokenForDisplay(token, tokenType) {
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
 * Bind token buttons to copy and toggle display of decoded token (generic version)
 * @param {HTMLElement} container - The container with the buttons
 * @param {string} displayAreaId - The ID of the display area element
 */
function bindStepTokenButtons(container, displayAreaId) {
  const displayArea = document.getElementById(displayAreaId);
  let currentlyDisplayedKey = null;

  container.querySelectorAll('.btn-copy-token').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tokenKey;
      const token = tokens[key];
      if (!token) return;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(token);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = token;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

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
        displayArea.innerHTML = `<div class="result-box">${formatJSON(decoded)}</div>`;
        displayArea.hidden = false;
        currentlyDisplayedKey = key;
        // Update active state
        container.querySelectorAll('.btn-copy-token').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
}

function showResult(step, data) {
  const resultEl = document.getElementById(`result-${step}`);

  // Step 2: Show just the button, display token on click (like Step 1)
  if (step === 2 && tokens.idJagToken) {
    const copyButtons = buildTokenCopyButtons([
      { label: 'ID-JAG Token', key: 'idJagToken', token: tokens.idJagToken },
    ], true); // showLabel = true
    resultEl.innerHTML = copyButtons + `<div class="token-display-area" id="step2-token-display" hidden></div>`;
    resultEl.classList.add('visible');
    bindStepTokenButtons(resultEl, 'step2-token-display');
    return;
  }

  // Step 3: Show just the button, display token on click
  if (step === 3 && tokens.authServerToken) {
    const copyButtons = buildTokenCopyButtons([
      { label: 'Access Token', key: 'authServerToken', token: tokens.authServerToken },
    ], true); // showLabel = true
    resultEl.innerHTML = copyButtons + `<div class="token-display-area" id="step3-token-display" hidden></div>`;
    resultEl.classList.add('visible');
    bindStepTokenButtons(resultEl, 'step3-token-display');
    return;
  }

  // Default: show JSON directly
  resultEl.innerHTML = `<div class="result-box">${formatJSON(data)}</div>`;
  resultEl.classList.add('visible');
}

function showError(step, message, logTimestamp) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.add('error');
  const resultEl = document.getElementById(`result-${step}`);
  const logLink = logTimestamp
    ? ` <a class="log-link" href="/log-viewer.html#${encodeURIComponent(logTimestamp)}" target="_blank">view log</a>`
    : ` <a class="log-link" href="/log-viewer.html" target="_blank">view log</a>`;
  resultEl.innerHTML = `<div class="error-box">${escapeHtml(message)}${logLink}</div>`;
  resultEl.classList.add('visible');
}

function showLoading(step) {
  const resultEl = document.getElementById(`result-${step}`);
  resultEl.innerHTML = '<div class="loading">Processing...</div>';
  resultEl.classList.add('visible');
}

function hideResult(step) {
  const resultEl = document.getElementById(`result-${step}`);
  resultEl.innerHTML = '';
  resultEl.classList.remove('visible');
}

function formatJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":\s*"([^"]*?)"/g, (match, key, val) => {
    return `"<span class="claim-key">${escapeHtml(key)}</span>": "<span class="claim-value">${escapeHtml(val)}</span>"`;
  }).replace(/"([^"]+)":\s*(\d+)/g, (match, key, val) => {
    return `"<span class="claim-key">${escapeHtml(key)}</span>": ${val}`;
  });
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
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

// --- Parameter Details Modal ---

function initParamModal() {
  const modal = document.getElementById('param-modal');
  const header = document.getElementById('param-modal-header');
  const closeBtn = document.getElementById('param-modal-close');
  const resizeHandle = document.getElementById('param-modal-resize');

  if (!modal) return;

  // Close button
  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
  });

  // Make modal draggable
  let isDragging = false;
  let dragStartX, dragStartY, modalStartX, modalStartY;

  header.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = modal.getBoundingClientRect();
    modalStartX = rect.left;
    modalStartY = rect.top;
    modal.style.transform = 'none';
    modal.style.left = modalStartX + 'px';
    modal.style.top = modalStartY + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    modal.style.left = (modalStartX + dx) + 'px';
    modal.style.top = (modalStartY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Make modal resizable
  let isResizing = false;
  let resizeStartX, resizeStartY, modalStartW, modalStartH;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    const rect = modal.getBoundingClientRect();
    modalStartW = rect.width;
    modalStartH = rect.height;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dw = e.clientX - resizeStartX;
    const dh = e.clientY - resizeStartY;
    modal.style.width = Math.max(350, modalStartW + dw) + 'px';
    modal.style.height = Math.max(200, modalStartH + dh) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
  });

  // Bind "Explain cURL" links
  document.querySelectorAll('.curl-explain-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const step = link.dataset.step;
      showParamDetails(step);
    });
  });
}

function showParamDetails(step) {
  const modal = document.getElementById('param-modal');
  const title = document.getElementById('param-modal-title');
  const body = document.getElementById('param-modal-body');

  const cfg = getConfigRaw();
  const authServerId = cfg.authorizationServerId || '{auth-server-id}';

  let content = '';

  switch (step) {
    case '1':
      title.textContent = 'Step 1: Authorization Code Flow Parameters';
      content = getStep1ParamDetails(cfg, authServerId);
      break;
    case '2':
      title.textContent = 'Step 2: Token Exchange (RFC 8693) Parameters';
      content = getStep2ParamDetails(cfg, authServerId);
      break;
    case '3':
      title.textContent = 'Step 3: JWT Bearer Grant (RFC 7523) Parameters';
      content = getStep3ParamDetails(cfg, authServerId);
      break;
    case '4':
      title.textContent = 'Step 4: API Request Parameters';
      content = getStep4ParamDetails();
      break;
  }

  body.innerHTML = content;
  modal.hidden = false;
}

function getStep1ParamDetails(cfg, authServerId) {
  return `
    <div class="param-section">
      <div class="param-section-title">Authorize Endpoint Parameters</div>
      <table class="param-table">
        <tr>
          <th>Parameter</th>
          <th>Source / Description</th>
        </tr>
        <tr>
          <td class="param-name">client_id</td>
          <td class="param-source">From <code>Configuration → Origin Application → Client ID</code><br>The OAuth 2.0 client identifier for the agentic application</td>
        </tr>
        <tr>
          <td class="param-name">response_type</td>
          <td class="param-source">Fixed value: <code>code</code><br>Indicates Authorization Code flow</td>
        </tr>
        <tr>
          <td class="param-name">scope</td>
          <td class="param-source">Fixed: <code>openid profile email</code><br>Standard OIDC scopes for user info</td>
        </tr>
        <tr>
          <td class="param-name">redirect_uri</td>
          <td class="param-source">From <code>Configuration → Origin Application → Redirect URI</code><br>Where Okta sends the authorization code</td>
        </tr>
        <tr>
          <td class="param-name">state</td>
          <td class="param-source">Generated: Random string<br>CSRF protection - verified on callback</td>
        </tr>
        <tr>
          <td class="param-name">nonce</td>
          <td class="param-source">Generated: Random string<br>Replay attack protection - included in ID token</td>
        </tr>
      </table>
    </div>
    <div class="param-section">
      <div class="param-section-title">Token Endpoint Parameters</div>
      <table class="param-table">
        <tr>
          <th>Parameter</th>
          <th>Source / Description</th>
        </tr>
        <tr>
          <td class="param-name">grant_type</td>
          <td class="param-source">Fixed value: <code>authorization_code</code></td>
        </tr>
        <tr>
          <td class="param-name">code</td>
          <td class="param-source">From Okta callback<br>The authorization code returned after user authentication</td>
        </tr>
        <tr>
          <td class="param-name">client_id</td>
          <td class="param-source">From <code>Configuration → Client ID</code></td>
        </tr>
        <tr>
          <td class="param-name">client_secret</td>
          <td class="param-source">From <code>Configuration → Client Secret</code><br>Used for confidential client authentication</td>
        </tr>
        <tr>
          <td class="param-name">redirect_uri</td>
          <td class="param-source">Must match the authorize request</td>
        </tr>
      </table>
    </div>
  `;
}

function getStep2ParamDetails(cfg, authServerId) {
  const principalId = cfg.principalId || '{principal-id}';
  const domain = cfg.oktaDomain || '{okta-domain}';

  return `
    <div class="param-section">
      <div class="param-section-title">Token Exchange Request Parameters</div>
      <table class="param-table">
        <tr>
          <th>Parameter</th>
          <th>Source / Description</th>
        </tr>
        <tr>
          <td class="param-name">grant_type</td>
          <td class="param-source">Fixed: <code>urn:ietf:params:oauth:grant-type:token-exchange</code><br>RFC 8693 Token Exchange grant</td>
        </tr>
        <tr>
          <td class="param-name">subject_token</td>
          <td class="param-source">From Step 1 result<br>The user's access_token or id_token obtained from SSO</td>
        </tr>
        <tr>
          <td class="param-name">subject_token_type</td>
          <td class="param-source">From step option picker<br><code>urn:ietf:params:oauth:token-type:access_token</code> or<br><code>urn:ietf:params:oauth:token-type:id_token</code></td>
        </tr>
        <tr>
          <td class="param-name">requested_token_type</td>
          <td class="param-source">Fixed: <code>urn:ietf:params:oauth:token-type:id-jag</code><br>Requests an Identity Assertion (ID-JAG) token</td>
        </tr>
        <tr>
          <td class="param-name">audience</td>
          <td class="param-source">Constructed: <code>${escapeHtml(domain)}/oauth2/${escapeHtml(authServerId)}</code><br>The target authorization server URL</td>
        </tr>
        <tr>
          <td class="param-name">scope</td>
          <td class="param-source">From <code>Configuration → Token Exchange Scope</code><br>Optional scopes for the exchanged token</td>
        </tr>
        <tr>
          <td class="param-name">client_assertion_type</td>
          <td class="param-source">Fixed: <code>urn:ietf:params:oauth:client-assertion-type:jwt-bearer</code><br>Indicates JWT-based client authentication</td>
        </tr>
        <tr>
          <td class="param-name">client_assertion</td>
          <td class="param-source">Generated JWT signed with Agent's private key<br>See JWT structure below</td>
        </tr>
      </table>
    </div>
    ${getClientAssertionDetails(cfg, 'token exchange')}
  `;
}

function getStep3ParamDetails(cfg, authServerId) {
  return `
    <div class="param-section">
      <div class="param-section-title">JWT Bearer Grant Request Parameters</div>
      <table class="param-table">
        <tr>
          <th>Parameter</th>
          <th>Source / Description</th>
        </tr>
        <tr>
          <td class="param-name">grant_type</td>
          <td class="param-source">Fixed: <code>urn:ietf:params:oauth:grant-type:jwt-bearer</code><br>RFC 7523 JWT Bearer Assertion grant</td>
        </tr>
        <tr>
          <td class="param-name">assertion</td>
          <td class="param-source">From Step 2 result<br>The ID-JAG token obtained from token exchange</td>
        </tr>
        <tr>
          <td class="param-name">client_assertion_type</td>
          <td class="param-source">Fixed: <code>urn:ietf:params:oauth:client-assertion-type:jwt-bearer</code><br>Indicates JWT-based client authentication</td>
        </tr>
        <tr>
          <td class="param-name">client_assertion</td>
          <td class="param-source">Generated JWT signed with Agent's private key<br>Same structure as Step 2, but with different audience</td>
        </tr>
      </table>
    </div>
    ${getClientAssertionDetails(cfg, 'JWT bearer grant')}
  `;
}

function getStep4ParamDetails() {
  return `
    <div class="param-section">
      <div class="param-section-title">API Request Parameters</div>
      <table class="param-table">
        <tr>
          <th>Parameter</th>
          <th>Source / Description</th>
        </tr>
        <tr>
          <td class="param-name">Authorization</td>
          <td class="param-source">Header: <code>Bearer {access_token}</code><br>The access token from Step 3</td>
        </tr>
        <tr>
          <td class="param-name">URL</td>
          <td class="param-source">From the API URL input field<br>The resource server endpoint to test</td>
        </tr>
        <tr>
          <td class="param-name">Method</td>
          <td class="param-source">From the method dropdown<br>GET, POST, PUT, PATCH, or DELETE</td>
        </tr>
        <tr>
          <td class="param-name">Body</td>
          <td class="param-source">From the request body textarea (optional)<br>JSON payload for POST/PUT/PATCH requests</td>
        </tr>
      </table>
    </div>
    <div class="param-note">
      <div class="param-note-title">About the Access Token</div>
      The access token obtained in Step 3 represents the AI Agent acting on behalf of the user.
      It contains claims from both the original user and the agent's delegation chain.
    </div>
  `;
}

function getClientAssertionDetails(cfg, context) {
  const principalId = cfg.principalId || '{principal-id}';
  const domain = cfg.oktaDomain || '{okta-domain}';
  const authServerId = cfg.authorizationServerId || '{auth-server-id}';

  return `
    <div class="param-section">
      <div class="param-section-title">Client Assertion JWT Structure</div>
      <p style="font-size: 0.8rem; color: #666; margin-bottom: 0.75rem;">
        The client_assertion is a JWT signed with the Agent's private key. It authenticates the AI Agent to Okta.
      </p>
      <div class="jwt-structure">
        <div class="jwt-label">// Header</div>
        <div class="jwt-header">{</div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "alg":</span> <span class="jwt-claim-value">"RS256"</span><span class="jwt-claim-desc">// Signing algorithm</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "kid":</span> <span class="jwt-claim-value">"{key-id}"</span><span class="jwt-claim-desc">// From private JWK</span></div>
        <div class="jwt-header">}</div>
        <br>
        <div class="jwt-label">// Payload</div>
        <div class="jwt-payload">{</div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "iss":</span> <span class="jwt-claim-value">"${escapeHtml(principalId)}"</span><span class="jwt-claim-desc">// Principal ID</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "sub":</span> <span class="jwt-claim-value">"${escapeHtml(principalId)}"</span><span class="jwt-claim-desc">// Principal ID</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "aud":</span> <span class="jwt-claim-value">"${escapeHtml(domain)}/oauth2/.../token"</span><span class="jwt-claim-desc">// Token endpoint</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "exp":</span> <span class="jwt-claim-value">{now + 60}</span><span class="jwt-claim-desc">// Expires in 60s</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "iat":</span> <span class="jwt-claim-value">{now}</span><span class="jwt-claim-desc">// Issued at</span></div>
        <div class="jwt-claim"><span class="jwt-claim-key">  "jti":</span> <span class="jwt-claim-value">"{uuid}"</span><span class="jwt-claim-desc">// Unique token ID</span></div>
        <div class="jwt-payload">}</div>
        <br>
        <div class="jwt-label">// Signature</div>
        <div class="jwt-signature">RSASSA-PKCS1-v1_5(header + "." + payload, privateKey)</div>
      </div>
    </div>
    <div class="param-note">
      <div class="param-note-title">Where do these values come from?</div>
      <ul style="margin: 0.5rem 0 0 1rem; font-size: 0.8rem;">
        <li><strong>iss/sub:</strong> Configuration → Principal / Agent → Principal ID</li>
        <li><strong>aud:</strong> The token endpoint URL for the selected authorization server</li>
        <li><strong>kid:</strong> Extracted from Configuration → Private JWK</li>
        <li><strong>Signing key:</strong> The "d" (private exponent) from the Private JWK</li>
      </ul>
    </div>
  `;
}
