// Token Exchange Flow - Frontend Application

const CONFIG_KEY = 'okta_token_exchange_config';
const CONFIG_META_KEY = 'okta_token_exchange_config_meta';
const CONFIG_TYPE = 'token-exchange-flow';
const CONFIG_FIELDS = [
  'oktaDomain',
  'clientId',
  'clientSecret',
  'privateJwk',
  'scopes',
  'authorizationServerId',
  'audience',
  'requestedTokenType',
  'actorTokenType',
  'actorToken',
];

// Flow state
let subjectToken = null;
let subjectTokenType = null;
let exchangedToken = null;
let exchangedTokenType = null;

// Scope selector state
let availableScopes = [];
let selectedScopes = new Set(['openid', 'profile', 'email']);
let customScopes = new Set();
let fetchScopesTimeout = null;

const STANDARD_SCOPES = new Set(['openid', 'profile', 'email', 'address', 'phone', 'offline_access', 'device_sso']);
const FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadConfigFromStorage();
  setupAuthMethodToggle();
  setupAuthServerMode();
  setupActorTokenToggle();
  setupOktaDomainAutoCorrect();
  updateCurlCommands();
  initScopeSelector();

  // Bind buttons
  document.getElementById('btn-step-1').addEventListener('click', setSubjectToken);
  document.getElementById('btn-step-2').addEventListener('click', exchangeToken);
  document.getElementById('btn-step-3').addEventListener('click', verifyToken);
  document.getElementById('get-token-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('/auth-code-flow.html', '_blank');
  });
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

  // Save modal mode toggle
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

  // Fetch scopes
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
  cfg.clientAuthMethod = document.getElementById('cfg-clientAuthMethod').value;
  cfg.authServerMode = document.getElementById('cfg-authServerMode').value;
  cfg.authorizationServerId = getAuthServerId();
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
            restoreScopesFromString(cfg[field], cfg.customScopes || []);
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
      updateConfigStatus();
      updateAuthMethodUI();
      updateAuthServerUI();
      updateActorTokenUI();
    } catch (e) {
      console.error('Failed to load config', e);
    }
  }
}

function saveConfig() {
  const cfg = getConfig();
  cfg.customScopes = Array.from(customScopes);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  updateConfigStatus('Saved to browser', true);
  showDialog('Configuration saved to browser storage.');
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(CONFIG_META_KEY);
  updateConfigStatus();
  showDialog('Saved configuration cleared.');
}

function updateConfigStatus(message, saved) {
  const statusEl = document.getElementById('config-status');
  if (message) {
    statusEl.textContent = message;
    statusEl.classList.toggle('saved', saved);
  } else {
    const hasSaved = localStorage.getItem(CONFIG_KEY);
    statusEl.textContent = hasSaved ? 'Saved' : '';
    statusEl.classList.toggle('saved', !!hasSaved);
  }
}

// --- Auth Method Toggle ---

function setupAuthMethodToggle() {
  const select = document.getElementById('cfg-clientAuthMethod');
  select.addEventListener('change', updateAuthMethodUI);
  updateAuthMethodUI();
}

function updateAuthMethodUI() {
  const method = document.getElementById('cfg-clientAuthMethod').value;
  document.getElementById('cfg-clientSecret-row').hidden = method !== 'client_secret';
  const privateJwkRow = document.getElementById('cfg-privateJwk-row');
  if (privateJwkRow) privateJwkRow.hidden = method !== 'private_key';
}

// --- Actor Token Toggle ---

function setupActorTokenToggle() {
  const select = document.getElementById('cfg-actorTokenType');
  select.addEventListener('change', updateActorTokenUI);
  updateActorTokenUI();
}

function updateActorTokenUI() {
  const type = document.getElementById('cfg-actorTokenType').value;
  const row = document.getElementById('cfg-actorToken-row');
  if (row) row.hidden = !type;
}

// --- Auth Server Mode ---

function setupAuthServerMode() {
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');

  function updateUI() {
    const mode = modeSelect.value;
    customInput.hidden = mode !== 'custom';
    updateAuthServerPreview();
    debouncedFetchScopes();
  }

  modeSelect.addEventListener('change', updateUI);
  customInput.addEventListener('input', updateAuthServerPreview);
  updateUI();
}

function updateAuthServerUI() {
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');
  customInput.hidden = modeSelect.value !== 'custom';
  updateAuthServerPreview();
}

function updateAuthServerPreview() {
  const preview = document.getElementById('auth-server-preview');
  const authServerId = getAuthServerId();
  if (authServerId) {
    preview.textContent = `/oauth2/${authServerId}/v1/`;
  } else {
    preview.textContent = '/oauth2/v1/';
  }
  updateEndpointPreviews();
}

function getAuthServerId() {
  const mode = document.getElementById('cfg-authServerMode').value;
  if (mode === 'org') return '';
  if (mode === 'default') return 'default';
  return document.getElementById('cfg-authorizationServerId').value.trim();
}

function updateEndpointPreviews() {
  const authServerId = getAuthServerId();
  const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';

  const tokenEndpoint = document.getElementById('token-endpoint-preview');
  if (tokenEndpoint) tokenEndpoint.textContent = `${basePath}/token`;
}

// --- Okta Domain Auto-correct ---

function setupOktaDomainAutoCorrect() {
  const input = document.getElementById('cfg-oktaDomain');
  input.addEventListener('blur', () => {
    let val = input.value.trim();
    if (val && !val.startsWith('http')) {
      val = 'https://' + val;
    }
    val = val.replace(/\/+$/, '');
    input.value = val;
    updateCurlCommands();
  });
}

// --- Scope Selector ---

function initScopeSelector() {
  renderScopeSelector();

  document.getElementById('scope-add-btn').addEventListener('click', addCustomScope);
  document.getElementById('scope-custom-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomScope();
    }
  });
}

function renderScopeSelector() {
  const container = document.getElementById('scope-tiles');
  container.innerHTML = '';

  const allScopes = [...new Set([...FALLBACK_SCOPES, ...availableScopes, ...customScopes])];

  const sorted = allScopes.sort((a, b) => {
    const aCustom = customScopes.has(a);
    const bCustom = customScopes.has(b);
    const aStandard = STANDARD_SCOPES.has(a);
    const bStandard = STANDARD_SCOPES.has(b);

    if (aCustom && !bCustom) return -1;
    if (!aCustom && bCustom) return 1;
    if (!aStandard && bStandard) return -1;
    if (aStandard && !bStandard) return 1;
    return a.localeCompare(b);
  });

  sorted.forEach(scope => {
    const tile = document.createElement('span');
    const isSelected = selectedScopes.has(scope);
    const isCustom = customScopes.has(scope);
    const isStandard = STANDARD_SCOPES.has(scope);

    tile.className = 'scope-tile';
    if (isCustom) {
      tile.classList.add('custom');
    } else if (isSelected) {
      tile.classList.add('selected');
    } else {
      tile.classList.add('available');
      if (isStandard) tile.classList.add('standard');
    }

    tile.innerHTML = scope;
    if (isCustom) {
      tile.innerHTML += '<span class="scope-remove">×</span>';
    }

    tile.addEventListener('click', (e) => {
      if (isCustom && e.target.classList.contains('scope-remove')) {
        customScopes.delete(scope);
        selectedScopes.delete(scope);
      } else {
        if (selectedScopes.has(scope)) {
          selectedScopes.delete(scope);
        } else {
          selectedScopes.add(scope);
        }
      }
      updateScopesValue();
      renderScopeSelector();
    });

    container.appendChild(tile);
  });

  updateScopesValue();
}

function addCustomScope() {
  const input = document.getElementById('scope-custom-input');
  const scope = input.value.trim();
  if (scope && !selectedScopes.has(scope) && !customScopes.has(scope)) {
    customScopes.add(scope);
    selectedScopes.add(scope);
    input.value = '';
    renderScopeSelector();
  }
}

function updateScopesValue() {
  const hidden = document.getElementById('cfg-scopes');
  hidden.value = Array.from(selectedScopes).join(' ');
  updateCurlCommands();
}

function restoreScopesFromString(scopeString, customScopesList) {
  selectedScopes = new Set(scopeString.split(' ').filter(s => s));
  customScopes = new Set(customScopesList || []);
  renderScopeSelector();
}

function debouncedFetchScopes() {
  clearTimeout(fetchScopesTimeout);
  fetchScopesTimeout = setTimeout(fetchScopes, 500);
}

async function fetchScopes() {
  const cfg = getConfig();
  if (!cfg.oktaDomain) return;

  const authServerId = getAuthServerId();
  if (!authServerId) {
    availableScopes = [...FALLBACK_SCOPES];
    renderScopeSelector();
    return;
  }

  try {
    const metadataUrl = `${cfg.oktaDomain}/oauth2/${authServerId}/.well-known/oauth-authorization-server`;
    const res = await fetch(metadataUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.scopes_supported) {
        availableScopes = data.scopes_supported;
        renderScopeSelector();
      }
    }
  } catch (e) {
    console.log('Could not fetch scopes:', e.message);
  }
}

// --- cURL Commands ---

function updateCurlCommands() {
  const cfg = getConfig();
  const authServerId = getAuthServerId();
  const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
  const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

  let curl = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\`;

  if (cfg.clientAuthMethod === 'client_secret' && cfg.clientSecret) {
    const auth = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
    curl += `\n  -H "Authorization: Basic ${auth}" \\`;
  }

  curl += `\n  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\
  -d "subject_token=<SUBJECT_TOKEN>" \\
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"`;

  if (cfg.audience) {
    curl += ` \\\n  -d "audience=${cfg.audience}"`;
  }

  if (cfg.requestedTokenType) {
    curl += ` \\\n  -d "requested_token_type=${cfg.requestedTokenType}"`;
  }

  if (cfg.scopes) {
    curl += ` \\\n  -d "scope=${cfg.scopes}"`;
  }

  if (cfg.actorTokenType && cfg.actorToken) {
    curl += ` \\\n  -d "actor_token=${cfg.actorToken}"`;
    curl += ` \\\n  -d "actor_token_type=${cfg.actorTokenType}"`;
  }

  document.getElementById('curl-2').textContent = curl;
  updateEndpointPreviews();
}

// --- Flow Steps ---

function setSubjectToken() {
  const tokenInput = document.getElementById('subject-token-input');
  const tokenTypeSelect = document.getElementById('subject-token-type');

  const token = tokenInput.value.trim();
  if (!token) {
    showDialog('Please enter a subject token.');
    return;
  }

  subjectToken = token;
  subjectTokenType = tokenTypeSelect.value;

  setStepComplete(1);

  // Try to decode and show preview
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      showStepResult(1, `<div class="result-box">Token set. Subject: ${payload.sub || 'N/A'}, Issuer: ${payload.iss || 'N/A'}</div>`);
    } else {
      showStepResult(1, '<div class="result-box">Opaque token set.</div>');
    }
  } catch {
    showStepResult(1, '<div class="result-box">Token set (could not decode).</div>');
  }

  // Unlock step 2
  unlockStep(2);
  document.getElementById('btn-step-2').disabled = false;
  updateCurlCommands();
}

async function exchangeToken() {
  const cfg = getConfig();
  if (!cfg.oktaDomain || !cfg.clientId) {
    showDialog('Please configure Okta Domain and Client ID.');
    return;
  }

  if (!subjectToken) {
    showDialog('Please set a subject token first.');
    return;
  }

  setStepLoading(2, true);
  clearStepResult(2);

  try {
    const res = await fetch('/api/token-exchange/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: cfg,
        subjectToken,
        subjectTokenType,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Token exchange failed');

    exchangedToken = data.access_token;
    exchangedTokenType = data.issued_token_type || data.token_type;

    setStepComplete(2);
    showStepResult(2, `<div class="result-box">Token exchanged successfully.\nIssued Token Type: ${exchangedTokenType}\nExpires In: ${data.expires_in}s</div>`);

    // Update curl with actual command
    if (data.curl) {
      document.getElementById('curl-2').textContent = data.curl;
    }

    // Unlock step 3
    unlockStep(3);
    document.getElementById('btn-step-3').disabled = false;

    // Show token details
    document.getElementById('token-details').hidden = false;
    switchTokenTab('exchanged-token');
  } catch (err) {
    setStepError(2, err.message);
  } finally {
    setStepLoading(2, false);
  }
}

async function verifyToken() {
  const cfg = getConfig();

  if (!exchangedToken) {
    showDialog('No exchanged token available. Complete Step 2 first.');
    return;
  }

  setStepLoading(3, true);
  clearStepResult(3);

  try {
    const res = await fetch('/api/token-exchange/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: cfg,
        token: exchangedToken,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');

    setStepComplete(3);
    showStepResult(3, `<div class="result-box">${formatJson(data)}</div>`);
  } catch (err) {
    setStepError(3, err.message);
  } finally {
    setStepLoading(3, false);
  }
}

// --- Step UI Helpers ---

function setStepLoading(step, loading) {
  const btn = document.getElementById(`btn-step-${step}`);
  if (btn) btn.disabled = loading;
}

function setStepComplete(step) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.remove('error');
  stepEl.classList.add('completed');
}

function setStepError(step, message) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.remove('completed');
  stepEl.classList.add('error');
  showStepResult(step, `<div class="error-box">${message}</div>`);
  setStepLoading(step, false);
}

function unlockStep(step) {
  document.getElementById(`step-${step}`).classList.remove('locked');
}

function lockStep(step) {
  document.getElementById(`step-${step}`).classList.add('locked');
  document.getElementById(`step-${step}`).classList.remove('completed', 'error');
}

function showStepResult(step, html) {
  const el = document.getElementById(`result-${step}`);
  el.innerHTML = html;
  el.classList.add('visible');
}

function clearStepResult(step) {
  const el = document.getElementById(`result-${step}`);
  el.innerHTML = '';
  el.classList.remove('visible');
}

// --- Token Display ---

function switchTokenTab(tab) {
  document.querySelectorAll('.token-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.token-tab[data-tab="${tab}"]`)?.classList.add('active');

  const content = document.getElementById('token-content');

  if (!exchangedToken) {
    content.innerHTML = '<div class="token-empty">No token available</div>';
    return;
  }

  try {
    const parts = exchangedToken.split('.');
    if (parts.length === 3) {
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));

      content.innerHTML = `
        <div class="token-section">
          <h4>Header</h4>
          <div class="token-json">${formatJson(header)}</div>
        </div>
        <div class="token-section">
          <h4>Payload</h4>
          <div class="token-json">${formatJson(payload)}</div>
        </div>
        <div class="token-section">
          <h4>Raw Token</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" onclick="copyToken()">Copy</button>
            <div class="token-raw">${exchangedToken}</div>
          </div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="token-section">
          <h4>Token (Opaque)</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" onclick="copyToken()">Copy</button>
            <div class="token-raw">${exchangedToken}</div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    content.innerHTML = `<div class="error-state">Failed to decode token: ${e.message}</div>`;
  }
}

function copyToken() {
  if (exchangedToken) {
    navigator.clipboard.writeText(exchangedToken);
    showDialog('Token copied to clipboard.');
  }
}

function formatJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="claim-key">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span class="claim-value">"$1"</span>');
}

// --- Reset ---

async function doReset() {
  subjectToken = null;
  subjectTokenType = null;
  exchangedToken = null;
  exchangedTokenType = null;

  document.getElementById('subject-token-input').value = '';

  // Reset UI
  for (let i = 1; i <= 3; i++) {
    clearStepResult(i);
    const stepEl = document.getElementById(`step-${i}`);
    stepEl.classList.remove('completed', 'error');
    if (i > 1) stepEl.classList.add('locked');
  }

  document.getElementById('btn-step-2').disabled = true;
  document.getElementById('btn-step-3').disabled = true;
  document.getElementById('token-details').hidden = true;

  try {
    await fetch('/api/steps/reset', { method: 'POST' });
  } catch (e) {
    console.error('Reset failed:', e);
  }
}

// --- Modals and Dialogs ---

function showDialog(message, title) {
  document.getElementById('dialog-title').textContent = title || 'Message';
  document.getElementById('dialog-message').textContent = message;
  document.getElementById('dialog-modal').hidden = false;
}

function closeDialog() {
  document.getElementById('dialog-modal').hidden = true;
}

async function openConfigsModal() {
  document.getElementById('configs-modal').hidden = false;
  const listEl = document.getElementById('configs-list');
  listEl.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res = await fetch(`/api/configs?type=${CONFIG_TYPE}`);
    const configs = await res.json();

    if (configs.length === 0) {
      listEl.innerHTML = '<div class="config-list-empty">No saved configurations</div>';
      return;
    }

    listEl.innerHTML = configs.map(cfg => `
      <div class="config-card">
        <div class="config-card-header">
          <strong>${cfg.name}</strong>
          <span class="config-card-creator">${cfg.createdBy || 'Unknown'}</span>
        </div>
        <div class="config-card-domain">${cfg.data?.oktaDomain || '-'}</div>
        <div class="config-card-actions">
          <button class="btn-load" onclick="loadConfig('${cfg.id}')">Load</button>
          <button class="btn-delete" onclick="deleteConfig('${cfg.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load configurations: ${e.message}</div>`;
  }
}

function closeConfigsModal() {
  document.getElementById('configs-modal').hidden = true;
}

async function loadConfig(id) {
  try {
    const res = await fetch(`/api/configs/${id}`);
    const cfg = await res.json();

    for (const field of CONFIG_FIELDS) {
      const el = document.getElementById(`cfg-${field}`);
      if (el && cfg.data[field]) {
        if (field === 'scopes') {
          restoreScopesFromString(cfg.data[field], cfg.data.customScopes || []);
        } else {
          el.value = cfg.data[field];
        }
      }
    }

    if (cfg.data.clientAuthMethod) {
      document.getElementById('cfg-clientAuthMethod').value = cfg.data.clientAuthMethod;
    }
    if (cfg.data.authServerMode) {
      document.getElementById('cfg-authServerMode').value = cfg.data.authServerMode;
    }

    updateAuthMethodUI();
    updateAuthServerUI();
    updateActorTokenUI();
    updateCurlCommands();
    closeConfigsModal();
    updateConfigStatus(`Loaded: ${cfg.name}`, true);
  } catch (e) {
    showDialog(`Failed to load configuration: ${e.message}`);
  }
}

async function deleteConfig(id) {
  if (!confirm('Delete this configuration?')) return;

  try {
    await fetch(`/api/configs/${id}`, { method: 'DELETE' });
    openConfigsModal();
  } catch (e) {
    showDialog(`Failed to delete: ${e.message}`);
  }
}

async function saveToServer() {
  const name = prompt('Configuration name:');
  if (!name) return;

  const cfg = getConfig();
  cfg.customScopes = Array.from(customScopes);

  try {
    const userName = JSON.parse(localStorage.getItem('okta_current_user') || '{}').name || 'Unknown';
    const res = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: CONFIG_TYPE,
        data: cfg,
        createdBy: userName,
      }),
    });

    if (!res.ok) throw new Error('Failed to save');
    showDialog('Configuration saved to server.');
    updateConfigStatus(`Saved: ${name}`, true);
  } catch (e) {
    showDialog(`Failed to save: ${e.message}`);
  }
}

// Make functions available globally for onclick handlers
window.loadConfig = loadConfig;
window.deleteConfig = deleteConfig;
window.copyToken = copyToken;
