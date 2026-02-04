// Device Authorization Grant Flow - Frontend Application

const CONFIG_KEY = 'okta_device_grant_config';
const CONFIG_META_KEY = 'okta_device_grant_config_meta';
const CONFIG_TYPE = 'device-grant-flow';
const CONFIG_FIELDS = [
  'oktaDomain',
  'clientId',
  'scopes',
  'authorizationServerId',
];

// Flow state
let deviceCode = null;
let userCode = null;
let verificationUri = null;
let verificationUriComplete = null;
let interval = 5;
let expiresIn = 600;
let pollingTimer = null;
let pollCount = 0;

// Tokens
const tokens = {
  accessToken: null,
  idToken: null,
  refreshToken: null,
};

// Scope selector state
let availableScopes = [];
let selectedScopes = new Set(['openid', 'profile', 'email', 'offline_access']);
let customScopes = new Set();
let fetchScopesTimeout = null;

const STANDARD_SCOPES = new Set(['openid', 'profile', 'email', 'address', 'phone', 'offline_access', 'device_sso']);
const FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadConfigFromStorage();
  setupAuthServerMode();
  setupOktaDomainAutoCorrect();
  updateCurlCommands();
  initScopeSelector();

  // Bind buttons
  document.getElementById('btn-step-1').addEventListener('click', requestDeviceCode);
  document.getElementById('btn-step-2').addEventListener('click', openVerificationUrl);
  document.getElementById('btn-step-3').addEventListener('click', startPolling);
  document.getElementById('btn-stop-polling')?.addEventListener('click', stopPolling);
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

  // Fetch scopes when domain/auth server changes
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
      if (cfg.authServerMode) {
        document.getElementById('cfg-authServerMode').value = cfg.authServerMode;
      }
      if (cfg.customScopes) {
        customScopes = new Set(cfg.customScopes);
      }
      updateConfigStatus();
      updateAuthServerUI();
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

// --- Auth Server Mode ---

function setupAuthServerMode() {
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');
  const preview = document.getElementById('auth-server-preview');

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

  const deviceEndpoint = document.getElementById('device-endpoint-preview');
  if (deviceEndpoint) deviceEndpoint.textContent = `${basePath}/device/authorize`;

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

  // Sort: custom first, then server scopes, then standard scopes
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
  const deviceEndpoint = `${cfg.oktaDomain}${basePath}/device/authorize`;

  // Step 1: Request device code
  let curl1 = `curl --request POST \\
  --url "${deviceEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${cfg.clientId || '<CLIENT_ID>'}" \\
  -d "scope=${cfg.scopes || 'openid profile'}"`;

  document.getElementById('curl-1').textContent = curl1;
  updateEndpointPreviews();
}

function updatePollingCurl() {
  const cfg = getConfig();
  const authServerId = getAuthServerId();
  const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
  const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

  let curl = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \\
  -d "client_id=${cfg.clientId}" \\
  -d "device_code=${deviceCode}"`;

  document.getElementById('curl-3').textContent = curl;
}

// --- Flow Steps ---

async function requestDeviceCode() {
  const cfg = getConfig();
  if (!cfg.oktaDomain || !cfg.clientId) {
    showDialog('Please configure Okta Domain and Client ID.');
    return;
  }

  setStepLoading(1, true);
  clearStepResult(1);

  try {
    const res = await fetch('/api/device/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cfg }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get device code');

    deviceCode = data.device_code;
    userCode = data.user_code;
    verificationUri = data.verification_uri;
    verificationUriComplete = data.verification_uri_complete;
    interval = data.interval || 5;
    expiresIn = data.expires_in || 600;

    // Show device code display
    document.getElementById('device-code-display').hidden = false;
    document.getElementById('user-code-value').textContent = userCode;
    const link = document.getElementById('verification-uri-link');
    link.href = verificationUriComplete || verificationUri;
    link.textContent = verificationUri;

    setStepComplete(1);
    showStepResult(1, `Device code received. Expires in ${Math.floor(expiresIn / 60)} minutes.`);

    // Unlock steps 2 and 3
    unlockStep(2);
    unlockStep(3);
    document.getElementById('btn-step-2').disabled = false;
    document.getElementById('btn-step-3').disabled = false;

    updatePollingCurl();
  } catch (err) {
    setStepError(1, err.message);
  } finally {
    setStepLoading(1, false);
  }
}

function openVerificationUrl() {
  const url = verificationUriComplete || verificationUri;
  if (url) {
    window.open(url, '_blank');
  }
}

async function startPolling() {
  if (!deviceCode) {
    showDialog('No device code available. Complete Step 1 first.');
    return;
  }

  const cfg = getConfig();
  pollCount = 0;

  document.getElementById('btn-step-3').disabled = true;
  document.getElementById('btn-stop-polling').hidden = false;

  clearStepResult(3);
  showStepResult(3, createPollingStatus('Polling for authorization...', 'pending'));

  pollingTimer = setInterval(async () => {
    pollCount++;
    updatePollingStatus(`Polling... (attempt ${pollCount})`);

    try {
      const res = await fetch('/api/device/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: cfg,
          deviceCode: deviceCode,
        }),
      });

      const data = await res.json();

      if (res.ok && data.access_token) {
        // Success!
        stopPolling();
        tokens.accessToken = data.access_token;
        tokens.idToken = data.id_token;
        tokens.refreshToken = data.refresh_token;

        setStepComplete(3);
        showStepResult(3, createPollingStatus('Authorization successful!', 'success'));

        // Show token details
        document.getElementById('token-details').hidden = false;
        switchTokenTab('access-token');
      } else if (data.error === 'authorization_pending') {
        // Keep polling
        updatePollingStatus(`Waiting for user authorization... (attempt ${pollCount})`);
      } else if (data.error === 'slow_down') {
        // Increase interval
        interval += 5;
        updatePollingStatus(`Slowing down polling interval to ${interval}s...`);
      } else if (data.error === 'expired_token') {
        stopPolling();
        setStepError(3, 'Device code expired. Please restart the flow.');
      } else if (data.error === 'access_denied') {
        stopPolling();
        setStepError(3, 'User denied the authorization request.');
      } else {
        stopPolling();
        setStepError(3, data.error_description || data.error || 'Unknown error');
      }
    } catch (err) {
      stopPolling();
      setStepError(3, err.message);
    }
  }, interval * 1000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  document.getElementById('btn-step-3').disabled = false;
  document.getElementById('btn-stop-polling').hidden = true;
}

function createPollingStatus(message, status) {
  let className = 'polling-status';
  if (status === 'success') className += ' success';
  if (status === 'error') className += ' error';

  let html = `<div class="${className}">`;
  if (status === 'pending') {
    html += '<div class="polling-spinner"></div>';
  }
  html += `<span>${message}</span>`;
  if (status === 'pending') {
    html += `<span class="polling-count">(attempt ${pollCount})</span>`;
  }
  html += '</div>';
  return html;
}

function updatePollingStatus(message) {
  const resultEl = document.getElementById('result-3');
  const statusEl = resultEl.querySelector('.polling-status span');
  const countEl = resultEl.querySelector('.polling-count');
  if (statusEl) statusEl.textContent = message;
  if (countEl) countEl.textContent = `(attempt ${pollCount})`;
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
  document.querySelector(`.token-tab[data-tab="${tab}"]`).classList.add('active');

  const content = document.getElementById('token-content');
  let token = null;
  let label = '';

  switch (tab) {
    case 'access-token':
      token = tokens.accessToken;
      label = 'Access Token';
      break;
    case 'id-token':
      token = tokens.idToken;
      label = 'ID Token';
      break;
    case 'refresh-token':
      token = tokens.refreshToken;
      label = 'Refresh Token';
      break;
  }

  if (!token) {
    content.innerHTML = '<div class="token-empty">No token available</div>';
    return;
  }

  try {
    const parts = token.split('.');
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
            <button class="btn btn-secondary btn-small copy-raw-btn" onclick="copyToken('${tab}')">Copy</button>
            <div class="token-raw">${token}</div>
          </div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="token-section">
          <h4>Token (Opaque)</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" onclick="copyToken('${tab}')">Copy</button>
            <div class="token-raw">${token}</div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    content.innerHTML = `<div class="error-state">Failed to decode token: ${e.message}</div>`;
  }
}

function copyToken(tab) {
  let token = null;
  switch (tab) {
    case 'access-token': token = tokens.accessToken; break;
    case 'id-token': token = tokens.idToken; break;
    case 'refresh-token': token = tokens.refreshToken; break;
  }
  if (token) {
    navigator.clipboard.writeText(token);
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
  stopPolling();
  deviceCode = null;
  userCode = null;
  verificationUri = null;
  verificationUriComplete = null;
  tokens.accessToken = null;
  tokens.idToken = null;
  tokens.refreshToken = null;
  pollCount = 0;

  // Reset UI
  for (let i = 1; i <= 3; i++) {
    clearStepResult(i);
    const stepEl = document.getElementById(`step-${i}`);
    stepEl.classList.remove('completed', 'error');
    if (i > 1) stepEl.classList.add('locked');
  }

  document.getElementById('btn-step-2').disabled = true;
  document.getElementById('btn-step-3').disabled = true;
  document.getElementById('device-code-display').hidden = true;
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

    if (cfg.data.authServerMode) {
      document.getElementById('cfg-authServerMode').value = cfg.data.authServerMode;
    }

    updateAuthServerUI();
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
