// Direct Authentication Flow - Frontend Application

const CONFIG_KEY = 'okta_direct_auth_config';
const CONFIG_META_KEY = 'okta_direct_auth_config_meta';
const CONFIG_TYPE = 'direct-auth-flow';
const CONFIG_FIELDS = [
  'oktaDomain',
  'clientId',
  'clientSecret',
  'scopes',
  'authorizationServerId',
  'authMethod',
  'mfaMethod',
];

// Flow state
let mfaToken = null;
let oobData = null;
let pollingTimer = null;

// Tokens
const tokens = {
  accessToken: null,
  idToken: null,
  refreshToken: null,
};

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
  setupAuthServerMode();
  setupAuthMethodToggle();
  setupOktaDomainAutoCorrect();
  updateCurlCommands();
  initScopeSelector();

  // Bind buttons
  document.getElementById('btn-step-1').addEventListener('click', primaryAuthentication);
  document.getElementById('btn-step-2').addEventListener('click', verifyMfa);
  document.getElementById('btn-step-3').addEventListener('click', () => {
    document.getElementById('token-details').hidden = false;
    switchTokenTab('access-token');
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
      updateAuthMethodUI();
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
  const methodSelect = document.getElementById('cfg-authMethod');
  methodSelect.addEventListener('change', updateAuthMethodUI);
  updateAuthMethodUI();
}

function updateAuthMethodUI() {
  const method = document.getElementById('cfg-authMethod').value;
  const passwordRow = document.getElementById('password-row');
  const otpRow = document.getElementById('otp-row');

  passwordRow.hidden = method !== 'password';
  otpRow.hidden = method !== 'otp';
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
  if (mode === 'default') return 'default';
  return document.getElementById('cfg-authorizationServerId').value.trim() || 'default';
}

function updateEndpointPreviews() {
  const authServerId = getAuthServerId();
  const basePath = `/oauth2/${authServerId}/v1`;

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
  const basePath = `/oauth2/${authServerId}/v1`;
  const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

  const method = cfg.authMethod || 'password';
  const username = document.getElementById('auth-username')?.value || '<USERNAME>';
  const password = method === 'password' ? (document.getElementById('auth-password')?.value || '<PASSWORD>') : '';
  const otp = method === 'otp' ? (document.getElementById('auth-otp')?.value || '<OTP>') : '';

  let curl1 = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\`;

  if (cfg.clientSecret) {
    const auth = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
    curl1 += `\n  -H "Authorization: Basic ${auth}" \\`;
  } else {
    curl1 += `\n  -d "client_id=${cfg.clientId || '<CLIENT_ID>'}" \\`;
  }

  if (method === 'password') {
    curl1 += `\n  -d "grant_type=password" \\
  -d "username=${username}" \\
  -d "password=${password}"`;
  } else if (method === 'otp') {
    curl1 += `\n  -d "grant_type=urn:okta:params:oauth:grant-type:otp" \\
  -d "login_hint=${username}" \\
  -d "otp=${otp}"`;
  } else if (method === 'oob') {
    curl1 += `\n  -d "grant_type=urn:okta:params:oauth:grant-type:oob" \\
  -d "login_hint=${username}" \\
  -d "channel_hint=push"`;
  }

  if (cfg.scopes) {
    curl1 += ` \\\n  -d "scope=${cfg.scopes}"`;
  }

  document.getElementById('curl-1').textContent = curl1;
  updateEndpointPreviews();
}

// --- Flow Steps ---

async function primaryAuthentication() {
  const cfg = getConfig();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const otp = document.getElementById('auth-otp').value.trim();

  if (!cfg.oktaDomain || !cfg.clientId) {
    showDialog('Please configure Okta Domain and Client ID.');
    return;
  }

  if (!username) {
    showDialog('Please enter a username.');
    return;
  }

  if (cfg.authMethod === 'password' && !password) {
    showDialog('Please enter a password.');
    return;
  }

  if (cfg.authMethod === 'otp' && !otp) {
    showDialog('Please enter an OTP code.');
    return;
  }

  setStepLoading(1, true);
  clearStepResult(1);

  try {
    const res = await fetch('/api/direct-auth/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: cfg,
        username,
        password: cfg.authMethod === 'password' ? password : undefined,
        otp: cfg.authMethod === 'otp' ? otp : undefined,
      }),
    });

    const data = await res.json();

    if (data.curl) {
      document.getElementById('curl-1').textContent = data.curl;
    }

    // Check for MFA required
    if (data.mfa_token) {
      mfaToken = data.mfa_token;
      oobData = data.oob_data;

      setStepComplete(1);
      showStepResult(1, `<div class="result-box">Primary authentication successful.\nMFA required: ${data.mfa_type || 'Yes'}</div>`);

      // Setup MFA form
      unlockStep(2);
      const mfaForm = document.getElementById('mfa-form');
      mfaForm.hidden = false;

      const challengeInfo = document.getElementById('mfa-challenge-info');
      if (data.oob_data) {
        challengeInfo.innerHTML = `<p>A ${data.oob_data.channel || 'push'} notification has been sent. Approve the request or enter the code below.</p>`;
        document.getElementById('mfa-oob-status').hidden = false;
        document.getElementById('mfa-otp-row').hidden = true;
        startOobPolling();
      } else {
        challengeInfo.innerHTML = `<p>Enter the verification code from your authenticator app.</p>`;
        document.getElementById('mfa-oob-status').hidden = true;
        document.getElementById('mfa-otp-row').hidden = false;
      }

      document.getElementById('btn-step-2').disabled = false;
      return;
    }

    // Check for tokens
    if (data.access_token) {
      handleTokenResponse(data);
      return;
    }

    throw new Error(data.error_description || data.error || 'Authentication failed');
  } catch (err) {
    setStepError(1, err.message);
  } finally {
    setStepLoading(1, false);
  }
}

async function verifyMfa() {
  const cfg = getConfig();
  const mfaOtp = document.getElementById('mfa-otp').value.trim();

  if (!mfaToken) {
    showDialog('No MFA token available. Complete Step 1 first.');
    return;
  }

  // If OOB, check if we need OTP
  if (oobData && !mfaOtp) {
    showDialog('Please enter the MFA code or wait for push approval.');
    return;
  }

  setStepLoading(2, true);
  clearStepResult(2);

  try {
    const res = await fetch('/api/direct-auth/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: cfg,
        mfaToken,
        otp: mfaOtp,
        oobCode: oobData?.oob_code,
      }),
    });

    const data = await res.json();

    if (data.curl) {
      document.getElementById('curl-2').textContent = data.curl;
    }

    if (data.access_token) {
      stopOobPolling();
      setStepComplete(2);
      showStepResult(2, '<div class="result-box">MFA verification successful.</div>');
      handleTokenResponse(data);
      return;
    }

    if (data.error === 'authorization_pending') {
      // Keep waiting
      return;
    }

    throw new Error(data.error_description || data.error || 'MFA verification failed');
  } catch (err) {
    setStepError(2, err.message);
    stopOobPolling();
  } finally {
    setStepLoading(2, false);
  }
}

function handleTokenResponse(data) {
  tokens.accessToken = data.access_token;
  tokens.idToken = data.id_token;
  tokens.refreshToken = data.refresh_token;

  // Complete step 1 if not already
  const step1El = document.getElementById('step-1');
  if (!step1El.classList.contains('completed')) {
    setStepComplete(1);
    showStepResult(1, '<div class="result-box">Authentication successful.</div>');
  }

  // Skip step 2 if no MFA
  const step2El = document.getElementById('step-2');
  if (!step2El.classList.contains('completed') && !mfaToken) {
    step2El.classList.remove('locked');
    step2El.classList.add('completed');
    showStepResult(2, '<div class="result-box">No MFA required.</div>');
  }

  // Complete step 3
  unlockStep(3);
  setStepComplete(3);
  showStepResult(3, `<div class="result-box">Tokens received.\nToken Type: ${data.token_type}\nExpires In: ${data.expires_in}s</div>`);
  document.getElementById('btn-step-3').disabled = false;

  // Show token details
  document.getElementById('token-details').hidden = false;
  switchTokenTab('access-token');
}

function startOobPolling() {
  const cfg = getConfig();
  let pollCount = 0;

  pollingTimer = setInterval(async () => {
    pollCount++;

    try {
      const res = await fetch('/api/direct-auth/mfa-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: cfg,
          mfaToken,
          oobCode: oobData?.oob_code,
        }),
      });

      const data = await res.json();

      if (data.access_token) {
        stopOobPolling();
        setStepComplete(2);
        showStepResult(2, '<div class="result-box">Push notification approved.</div>');
        handleTokenResponse(data);
      } else if (data.error && data.error !== 'authorization_pending') {
        stopOobPolling();
        setStepError(2, data.error_description || data.error);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 3000);
}

function stopOobPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// --- Step UI Helpers ---

function setStepLoading(step, loading) {
  const btn = document.getElementById(`btn-step-${step}`);
  if (btn) btn.disabled = loading;
}

function setStepComplete(step) {
  const stepEl = document.getElementById(`step-${step}`);
  stepEl.classList.remove('error', 'locked');
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
  let token = null;

  switch (tab) {
    case 'access-token':
      token = tokens.accessToken;
      break;
    case 'id-token':
      token = tokens.idToken;
      break;
    case 'refresh-token':
      token = tokens.refreshToken;
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
  stopOobPolling();
  mfaToken = null;
  oobData = null;
  tokens.accessToken = null;
  tokens.idToken = null;
  tokens.refreshToken = null;

  // Clear form inputs
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-otp').value = '';
  document.getElementById('mfa-otp').value = '';

  // Hide MFA form
  document.getElementById('mfa-form').hidden = true;
  document.getElementById('mfa-oob-status').hidden = true;

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

    if (cfg.data.authServerMode) {
      document.getElementById('cfg-authServerMode').value = cfg.data.authServerMode;
    }

    updateAuthServerUI();
    updateAuthMethodUI();
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
