// Native SSO to Web Flow - Frontend Application

const CONFIG_KEY = 'okta_native_to_web_config';
const CONFIG_META_KEY = 'okta_native_to_web_config_meta';
const CONFIG_TYPE = 'native-to-web-flow';
const CONFIG_FIELDS = [
  'oktaDomain',
  'nativeClientId',
  'nativeClientSecret',
  'webClientId',
  'webClientSecret',
  'webRedirectUri',
  'scopes',
  'webScopes',
  'authorizationServerId',
  'webAuthorizationServerId',
  'authMethod',
  'mfaMethod',
];

const CREDENTIALS_KEY = 'okta_native_to_web_credentials';

// Flow state
let idToken = null;
let idTokenClaims = null;
let deviceSecret = null;
let webSsoToken = null;
let accessToken = null;
let refreshToken = null;

// MFA state
let mfaToken = null;
let mfaOobChannel = null;
let mfaPollingTimer = null;

// Scope selector state (Native App)
let availableScopes = [];
let selectedScopes = new Set(['openid', 'profile', 'email', 'offline_access', 'interclient_access']);
let customScopes = new Set();
let fetchScopesTimeout = null;

// Scope selector state (Web App)
let webAvailableScopes = [];
let webSelectedScopes = new Set(['openid', 'profile', 'email']);
let webCustomScopes = new Set();
let fetchWebScopesTimeout = null;

const STANDARD_SCOPES = new Set(['openid', 'profile', 'email', 'address', 'phone', 'offline_access', 'device_sso', 'interclient_access']);
const FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access', 'device_sso', 'interclient_access'];
const WEB_FALLBACK_SCOPES = ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'];
const RECOMMENDED_SCOPES = new Set(['interclient_access']); // Show warning (orange) when deselected

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadConfigFromStorage();
  loadCredentialsFromStorage();
  setupAuthServerMode();
  setupOktaDomainAutoCorrect();
  updateCurlCommands();
  initScopeSelector();
  initWebScopeSelector();

  // Save credentials on input change
  const usernameEl = document.getElementById('auth-username');
  const passwordEl = document.getElementById('auth-password');
  if (usernameEl) usernameEl.addEventListener('input', saveCredentialsToStorage);
  if (passwordEl) passwordEl.addEventListener('input', saveCredentialsToStorage);

  // Listen for OAuth callback via BroadcastChannel
  const channel = new BroadcastChannel('oauth-callback');
  channel.onmessage = (event) => handleOAuthResult(event.data);

  // Also listen via postMessage
  window.addEventListener('message', handleOAuthMessage);

  // Bind buttons
  document.getElementById('btn-step-1').addEventListener('click', authenticateNativeApp);
  document.getElementById('btn-step-mfa')?.addEventListener('click', verifyMfa);
  document.getElementById('btn-step-2').addEventListener('click', extractDeviceSecret);
  document.getElementById('btn-step-3').addEventListener('click', exchangeForWebSsoToken);
  document.getElementById('btn-step-4').addEventListener('click', launchWebSession);
  document.getElementById('use-existing-link').addEventListener('click', (e) => {
    e.preventDefault();
    toggleExistingTokenPanel();
  });
  document.getElementById('btn-use-existing').addEventListener('click', useExistingToken);
  document.getElementById('btn-cancel-existing').addEventListener('click', () => {
    document.getElementById('existing-token-panel').hidden = true;
  });
  document.getElementById('reset-btn').addEventListener('click', doReset);

  // Auth method listeners
  const authMethodEl = document.getElementById('cfg-authMethod');
  if (authMethodEl) {
    authMethodEl.addEventListener('change', updateAuthMethodUI);
    updateAuthMethodUI();
  }
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
  cfg.webAuthServerMode = document.getElementById('cfg-webAuthServerMode')?.value || 'org';
  cfg.webAuthorizationServerId = getWebAuthServerId();
  return cfg;
}

function loadCredentialsFromStorage() {
  const saved = localStorage.getItem(CREDENTIALS_KEY);
  if (saved) {
    try {
      const creds = JSON.parse(saved);
      const usernameEl = document.getElementById('auth-username');
      const passwordEl = document.getElementById('auth-password');
      if (usernameEl && creds.username) usernameEl.value = creds.username;
      if (passwordEl && creds.password) passwordEl.value = creds.password;
    } catch (e) {
      console.error('Failed to load credentials', e);
    }
  }
}

function saveCredentialsToStorage() {
  const usernameEl = document.getElementById('auth-username');
  const passwordEl = document.getElementById('auth-password');
  const creds = {
    username: usernameEl?.value || '',
    password: passwordEl?.value || '',
  };
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
}

function clearCredentialsFromStorage() {
  localStorage.removeItem(CREDENTIALS_KEY);
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
          } else if (field === 'webScopes') {
            restoreWebScopesFromString(cfg[field], cfg.webCustomScopes || []);
          } else {
            el.value = cfg[field];
          }
        }
      }
      if (cfg.authServerMode) {
        document.getElementById('cfg-authServerMode').value = cfg.authServerMode;
      }
      if (cfg.webAuthServerMode) {
        const webModeEl = document.getElementById('cfg-webAuthServerMode');
        if (webModeEl) webModeEl.value = cfg.webAuthServerMode;
      }
      if (cfg.customScopes) {
        customScopes = new Set(cfg.customScopes);
      }
      if (cfg.webCustomScopes) {
        webCustomScopes = new Set(cfg.webCustomScopes);
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
  cfg.webCustomScopes = Array.from(webCustomScopes);
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
  // Native app auth server
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');

  function updateNativeUI() {
    const mode = modeSelect.value;
    customInput.hidden = mode !== 'custom';
    updateAuthServerPreview();
    debouncedFetchScopes();
  }

  modeSelect.addEventListener('change', updateNativeUI);
  customInput.addEventListener('input', updateAuthServerPreview);
  updateNativeUI();

  // Web app auth server
  const webModeSelect = document.getElementById('cfg-webAuthServerMode');
  const webCustomInput = document.getElementById('cfg-webAuthorizationServerId');

  if (webModeSelect && webCustomInput) {
    function updateWebUI() {
      const mode = webModeSelect.value;
      webCustomInput.hidden = mode !== 'custom';
      updateWebAuthServerPreview();
      debouncedFetchWebScopes();
    }

    webModeSelect.addEventListener('change', updateWebUI);
    webCustomInput.addEventListener('input', () => {
      updateWebAuthServerPreview();
      debouncedFetchWebScopes();
    });
    updateWebUI();
  }
}

function updateAuthServerUI() {
  const modeSelect = document.getElementById('cfg-authServerMode');
  const customInput = document.getElementById('cfg-authorizationServerId');
  if (customInput) customInput.hidden = modeSelect.value !== 'custom';
  updateAuthServerPreview();

  const webModeSelect = document.getElementById('cfg-webAuthServerMode');
  const webCustomInput = document.getElementById('cfg-webAuthorizationServerId');
  if (webModeSelect && webCustomInput) {
    webCustomInput.hidden = webModeSelect.value !== 'custom';
    updateWebAuthServerPreview();
  }
}

function updateAuthServerPreview() {
  const preview = document.getElementById('auth-server-preview');
  const authServerId = getAuthServerId();
  if (preview) {
    if (authServerId) {
      preview.textContent = `/oauth2/${authServerId}/v1/`;
    } else {
      preview.textContent = '/oauth2/v1/';
    }
  }
  updateEndpointPreviews();
}

function updateWebAuthServerPreview() {
  const preview = document.getElementById('web-auth-server-preview');
  const authServerId = getWebAuthServerId();
  if (preview) {
    if (authServerId) {
      preview.textContent = `/oauth2/${authServerId}/v1/`;
    } else {
      preview.textContent = '/oauth2/v1/';
    }
  }
  updateCurlCommands();
}

function getAuthServerId() {
  const mode = document.getElementById('cfg-authServerMode').value;
  if (mode === 'org') return '';
  if (mode === 'default') return 'default';
  return document.getElementById('cfg-authorizationServerId').value.trim();
}

function getWebAuthServerId() {
  const mode = document.getElementById('cfg-webAuthServerMode')?.value || 'org';
  if (mode === 'org') return '';
  if (mode === 'default') return 'default';
  return document.getElementById('cfg-webAuthorizationServerId')?.value.trim() || '';
}

function updateEndpointPreviews() {
  // Native app endpoints (for direct auth)
  const authServerId = getAuthServerId();
  const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';

  const tokenEndpoint1 = document.getElementById('token-endpoint-preview-1');
  if (tokenEndpoint1) tokenEndpoint1.textContent = `${basePath}/token`;

  const tokenEndpoint = document.getElementById('token-endpoint-preview');
  if (tokenEndpoint) tokenEndpoint.textContent = `${basePath}/token`;

  // Web app endpoints
  const webAuthServerId = getWebAuthServerId();
  const webBasePath = webAuthServerId ? `/oauth2/${webAuthServerId}/v1` : '/oauth2/v1';

  const authorizeEndpoint = document.getElementById('authorize-endpoint-preview');
  if (authorizeEndpoint) authorizeEndpoint.textContent = `${webBasePath}/authorize`;
}

// --- Auth Method UI ---

function updateAuthMethodUI() {
  const method = document.getElementById('cfg-authMethod')?.value || 'password';
  const passwordRow = document.getElementById('password-row');
  const otpRow = document.getElementById('otp-row');

  if (passwordRow) passwordRow.hidden = method !== 'password';
  if (otpRow) otpRow.hidden = method !== 'otp';

  updateCurlCommands();
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
    const isRecommended = RECOMMENDED_SCOPES.has(scope);

    tile.className = 'scope-tile';
    if (isCustom) {
      tile.classList.add('custom');
    } else if (isSelected) {
      tile.classList.add('selected');
    } else if (isRecommended) {
      // Show warning (orange) for recommended scopes that are deselected
      tile.classList.add('warning');
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

// --- Web App Scope Selector ---

function initWebScopeSelector() {
  renderWebScopeSelector();

  const addBtn = document.getElementById('web-scope-add-btn');
  const input = document.getElementById('web-scope-custom-input');

  if (addBtn) {
    addBtn.addEventListener('click', addWebCustomScope);
  }
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWebCustomScope();
      }
    });
  }
}

function renderWebScopeSelector() {
  const container = document.getElementById('web-scope-tiles');
  if (!container) return;

  container.innerHTML = '';

  const allScopes = [...new Set([...WEB_FALLBACK_SCOPES, ...webAvailableScopes, ...webCustomScopes])];

  const sorted = allScopes.sort((a, b) => {
    const aCustom = webCustomScopes.has(a);
    const bCustom = webCustomScopes.has(b);
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
    const isSelected = webSelectedScopes.has(scope);
    const isCustom = webCustomScopes.has(scope);
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
        webCustomScopes.delete(scope);
        webSelectedScopes.delete(scope);
      } else {
        if (webSelectedScopes.has(scope)) {
          webSelectedScopes.delete(scope);
        } else {
          webSelectedScopes.add(scope);
        }
      }
      updateWebScopesValue();
      renderWebScopeSelector();
    });

    container.appendChild(tile);
  });

  updateWebScopesValue();
}

function addWebCustomScope() {
  const input = document.getElementById('web-scope-custom-input');
  if (!input) return;

  const scope = input.value.trim();
  if (scope && !webSelectedScopes.has(scope) && !webCustomScopes.has(scope)) {
    webCustomScopes.add(scope);
    webSelectedScopes.add(scope);
    input.value = '';
    renderWebScopeSelector();
  }
}

function updateWebScopesValue() {
  const hidden = document.getElementById('cfg-webScopes');
  if (hidden) {
    hidden.value = Array.from(webSelectedScopes).join(' ');
  }
  updateCurlCommands();
}

function restoreWebScopesFromString(scopeString, customScopesList) {
  webSelectedScopes = new Set(scopeString.split(' ').filter(s => s));
  webCustomScopes = new Set(customScopesList || []);
  renderWebScopeSelector();
}

function debouncedFetchWebScopes() {
  clearTimeout(fetchWebScopesTimeout);
  fetchWebScopesTimeout = setTimeout(fetchWebScopes, 500);
}

async function fetchWebScopes() {
  const cfg = getConfig();
  if (!cfg.oktaDomain) return;

  const authServerId = getWebAuthServerId();
  if (!authServerId) {
    webAvailableScopes = [...WEB_FALLBACK_SCOPES];
    renderWebScopeSelector();
    return;
  }

  try {
    const metadataUrl = `${cfg.oktaDomain}/oauth2/${authServerId}/.well-known/oauth-authorization-server`;
    const res = await fetch(metadataUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.scopes_supported) {
        webAvailableScopes = data.scopes_supported;
        renderWebScopeSelector();
      }
    }
  } catch (e) {
    console.log('Could not fetch web scopes:', e.message);
  }
}

// --- cURL Commands ---

function updateCurlCommands() {
  const cfg = getConfig();
  const authServerId = getAuthServerId();
  const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
  const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

  // Step 1: Direct Authentication
  const authMethod = cfg.authMethod || 'password';
  let grantType = authMethod === 'otp' ? 'urn:okta:params:oauth:grant-type:otp' : 'password';
  let curl1 = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=${grantType}" \\
  -d "client_id=${cfg.nativeClientId || '<CLIENT_ID>'}" \\
  -d "scope=${Array.from(selectedScopes).join(' ')}" \\
  -d "username=<USERNAME>" \\`;

  if (authMethod === 'password') {
    curl1 += `\n  -d "password=<PASSWORD>"`;
  } else if (authMethod === 'otp') {
    curl1 += `\n  -d "otp=<OTP_CODE>"`;
  }

  const curl1El = document.getElementById('curl-1');
  if (curl1El) curl1El.textContent = curl1;

  // Step 4: Token exchange for web SSO token (uses native app auth server)
  let curl3 = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\`;

  if (cfg.nativeClientSecret) {
    const auth = btoa(`${cfg.nativeClientId}:${cfg.nativeClientSecret}`);
    curl3 += `\n  -H "Authorization: Basic ${auth}" \\`;
  }

  curl3 += `\n  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\
  -d "subject_token=<ID_TOKEN>" \\
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \\
  -d "requested_token_type=urn:okta:oauth:token-type:web_sso_token" \\
  -d "actor_token=<DEVICE_SECRET>" \\
  -d "actor_token_type=urn:x-amzn:oauth:token-type:device-secret" \\
  -d "audience=urn:okta:apps:${cfg.webClientId || '<WEB_CLIENT_ID>'}"`;

  document.getElementById('curl-3').textContent = curl3;

  // Step 5: Authorization URL with login_hint (uses web app auth server)
  const webAuthServerId = getWebAuthServerId();
  const webBasePath = webAuthServerId ? `/oauth2/${webAuthServerId}/v1` : '/oauth2/v1';
  const authorizeEndpoint = `${cfg.oktaDomain}${webBasePath}/authorize`;
  const webScopesStr = Array.from(webSelectedScopes).join(' ') || 'openid profile email';
  let curl4 = `${authorizeEndpoint}?
  client_id=${cfg.webClientId || '<WEB_CLIENT_ID>'}
  &response_type=code
  &scope=${webScopesStr}
  &redirect_uri=${cfg.webRedirectUri || '<WEB_REDIRECT_URI>'}
  &state=<STATE>
  &login_hint=<WEB_SSO_TOKEN>`;

  document.getElementById('curl-4').textContent = curl4.replace(/\n\s+/g, '\n  ');
  updateEndpointPreviews();
}

// --- OAuth Handling ---

function handleOAuthMessage(event) {
  if (event.data && event.data.type === 'oauth-callback') {
    handleOAuthResult(event.data);
  }
}

function handleOAuthResult(data) {
  if (data.error) {
    setStepError(1, `OAuth Error: ${data.error_description || data.error}`);
    return;
  }

  if (data.id_token) {
    idToken = data.id_token;
    try {
      const parts = idToken.split('.');
      idTokenClaims = JSON.parse(atob(parts[1]));
    } catch (e) {
      console.error('Failed to decode ID token', e);
    }

    setStepComplete(1);
    showStepResult(1, `<div class="result-box">Authentication successful.\nUser: ${idTokenClaims?.sub || 'N/A'}</div>`);

    // Unlock step 2
    unlockStep(2);
    document.getElementById('btn-step-2').disabled = false;

    // Show token details
    document.getElementById('token-details').hidden = false;
    switchTokenTab('id-token');
  }
}

// --- Flow Steps ---

async function authenticateNativeApp() {
  const cfg = getConfig();
  if (!cfg.oktaDomain || !cfg.nativeClientId) {
    showDialog('Please configure Okta Domain and Native App Client ID.');
    return;
  }

  const username = document.getElementById('auth-username')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const otp = document.getElementById('auth-otp')?.value.trim();
  const authMethod = cfg.authMethod || 'password';

  if (!username) {
    showDialog('Please enter a username.');
    return;
  }

  if (authMethod === 'password' && !password) {
    showDialog('Please enter a password.');
    return;
  }

  if (authMethod === 'otp' && !otp) {
    showDialog('Please enter an OTP code.');
    return;
  }

  // Check if interclient_access scope is selected (recommended but not required)
  if (!selectedScopes.has('interclient_access')) {
    console.warn('interclient_access scope is recommended for Native to Web SSO flow');
  }

  setStepLoading(1, true);
  clearStepResult(1);

  try {
    const res = await fetch('/api/direct-auth/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          ...cfg,
          clientId: cfg.nativeClientId,
          clientSecret: cfg.nativeClientSecret,
        },
        username,
        password: authMethod === 'password' ? password : undefined,
        otp: authMethod === 'otp' ? otp : undefined,
        authMethod,
        scopes: Array.from(selectedScopes).join(' '),
      }),
    });

    const data = await res.json();

    if (data.curl) {
      document.getElementById('curl-1').textContent = data.curl;
    }

    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    // Check if MFA is required
    if (data.mfa_token) {
      mfaToken = data.mfa_token;
      handleMfaRequired(data);
      return;
    }

    // Authentication successful
    handleAuthSuccess(data);
  } catch (err) {
    setStepError(1, err.message);
  } finally {
    setStepLoading(1, false);
  }
}

function handleMfaRequired(data) {
  setStepComplete(1);
  showStepResult(1, `<div class="result-box">Primary authentication successful. MFA required.</div>`);

  // Unlock and show MFA step
  const mfaStep = document.getElementById('step-mfa');
  if (mfaStep) {
    mfaStep.classList.remove('locked');
    document.getElementById('mfa-form').hidden = false;

    const challengeInfo = document.getElementById('mfa-challenge-info');
    const mfaMethod = document.getElementById('cfg-mfaMethod')?.value || 'otp';

    if (mfaMethod === 'oob') {
      challengeInfo.innerHTML = '<p>A push notification has been sent. Please approve it on your device.</p>';
      document.getElementById('mfa-otp-row').hidden = true;
      document.getElementById('mfa-oob-status').hidden = false;
      document.getElementById('btn-step-mfa').disabled = true;
      startMfaPolling();
    } else {
      challengeInfo.innerHTML = '<p>Please enter your MFA code.</p>';
      document.getElementById('mfa-otp-row').hidden = false;
      document.getElementById('mfa-oob-status').hidden = true;
      document.getElementById('btn-step-mfa').disabled = false;
    }
  }
}

function handleAuthSuccess(data) {
  idToken = data.id_token;
  accessToken = data.access_token;
  refreshToken = data.refresh_token;

  // Check for device_secret in response or in ID token claims
  if (data.device_secret) {
    deviceSecret = data.device_secret;
  }

  if (idToken) {
    try {
      const parts = idToken.split('.');
      idTokenClaims = JSON.parse(atob(parts[1]));
      // Also check for device secret in claims
      if (!deviceSecret && (idTokenClaims.ds || idTokenClaims.device_secret)) {
        deviceSecret = idTokenClaims.ds || idTokenClaims.device_secret;
      }
    } catch (e) {
      console.error('Failed to decode ID token', e);
    }
  }

  setStepComplete(1);

  // Build token buttons following agentic flow pattern
  const resultEl = document.getElementById('result-1');
  const tokenItems = [
    { label: 'Access Token', key: 'accessToken', token: accessToken },
    { label: 'ID Token', key: 'idToken', token: idToken },
    { label: 'Refresh Token', key: 'refreshToken', token: refreshToken },
    { label: 'Device Secret', key: 'deviceSecret', token: deviceSecret },
  ];
  const copyButtons = buildTokenCopyButtons(tokenItems, true);
  resultEl.innerHTML = copyButtons + `<div class="token-display-area" id="step1-token-display" hidden></div>`;
  resultEl.classList.add('visible');
  bindStep1CopyButtons(resultEl);

  // Skip MFA step and unlock device secret step
  const mfaStep = document.getElementById('step-mfa');
  if (mfaStep) mfaStep.classList.add('locked');

  unlockStep(2);
  document.getElementById('btn-step-2').disabled = false;

  // Show token details
  document.getElementById('token-details').hidden = false;
  switchTokenTab('id-token');
}

// Token state object for copy button handlers
const step1Tokens = {};

function buildTokenCopyButtons(items, showLabel = false) {
  const available = items.filter(item => item.token);
  if (!available.length) return '';

  // Store tokens for copy handlers
  available.forEach(item => {
    step1Tokens[item.key] = item.token;
  });

  const label = showLabel ? '<span class="token-copy-label"><span class="success-indicator">Success!</span> display and copy to clipboard:</span>' : '';
  const buttons = available.map(item =>
    `<button class="btn-copy-token" data-token-key="${item.key}" title="Copy ${item.label} to clipboard">${item.label}</button>`
  ).join('');
  return `<div class="token-copy-bar">${label}${buttons}</div>`;
}

function bindStep1CopyButtons(container) {
  const displayArea = document.getElementById('step1-token-display');
  let currentlyDisplayedKey = null;

  container.querySelectorAll('.btn-copy-token').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tokenKey;
      const token = step1Tokens[key];
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

function formatJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":\s*"([^"]*?)"/g, (match, key, val) => {
    return `"<span class="claim-key">${escapeHtml(key)}</span>": "<span class="claim-value">${escapeHtml(val)}</span>"`;
  }).replace(/"([^"]+)":\s*(\d+)/g, (match, key, val) => {
    return `"<span class="claim-key">${escapeHtml(key)}</span>": ${val}`;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function verifyMfa() {
  const mfaOtp = document.getElementById('mfa-otp')?.value.trim();
  const mfaMethod = document.getElementById('cfg-mfaMethod')?.value || 'otp';

  if (mfaMethod === 'otp' && !mfaOtp) {
    showDialog('Please enter your MFA code.');
    return;
  }

  document.getElementById('btn-step-mfa').disabled = true;

  try {
    const cfg = getConfig();
    const res = await fetch('/api/direct-auth/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          ...cfg,
          clientId: cfg.nativeClientId,
          clientSecret: cfg.nativeClientSecret,
        },
        mfaToken,
        otp: mfaOtp,
        mfaMethod,
      }),
    });

    const data = await res.json();

    if (data.curl) {
      document.getElementById('curl-mfa').textContent = data.curl;
    }

    if (!res.ok) {
      throw new Error(data.error || 'MFA verification failed');
    }

    // MFA successful
    stopMfaPolling();
    setStepComplete('mfa');
    showStepResult('mfa', `<div class="result-box">MFA verification successful.</div>`);

    handleAuthSuccess(data);
  } catch (err) {
    setStepError('mfa', err.message);
    document.getElementById('btn-step-mfa').disabled = false;
  }
}

function startMfaPolling() {
  mfaPollingTimer = setInterval(async () => {
    try {
      const cfg = getConfig();
      const res = await fetch('/api/direct-auth/mfa-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...cfg,
            clientId: cfg.nativeClientId,
            clientSecret: cfg.nativeClientSecret,
          },
          mfaToken,
        }),
      });

      const data = await res.json();

      if (data.access_token) {
        stopMfaPolling();
        setStepComplete('mfa');
        showStepResult('mfa', `<div class="result-box">Push notification approved.</div>`);
        handleAuthSuccess(data);
      }
    } catch (e) {
      console.error('MFA polling error:', e);
    }
  }, 2000);
}

function stopMfaPolling() {
  if (mfaPollingTimer) {
    clearInterval(mfaPollingTimer);
    mfaPollingTimer = null;
  }
}

function toggleExistingTokenPanel() {
  const panel = document.getElementById('existing-token-panel');
  panel.hidden = !panel.hidden;
}

function useExistingToken() {
  const tokenInput = document.getElementById('existing-id-token');
  const token = tokenInput.value.trim();

  if (!token) {
    showDialog('Please enter an ID token.');
    return;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    const claims = JSON.parse(atob(parts[1]));
    idToken = token;
    idTokenClaims = claims;

    document.getElementById('existing-token-panel').hidden = true;
    setStepComplete(1);
    showStepResult(1, `<div class="result-box">Token loaded.\nUser: ${claims.sub || 'N/A'}</div>`);

    // Unlock step 2
    unlockStep(2);
    document.getElementById('btn-step-2').disabled = false;

    // Show token details
    document.getElementById('token-details').hidden = false;
    switchTokenTab('id-token');
  } catch (e) {
    showDialog(`Invalid token: ${e.message}`);
  }
}

function extractDeviceSecret() {
  if (!idTokenClaims) {
    showDialog('No ID token available. Complete Step 1 first.');
    return;
  }

  // Look for device secret in the claims
  // The device secret is typically in the 'ds' or 'device_secret' claim
  deviceSecret = idTokenClaims.ds || idTokenClaims.device_secret;

  if (!deviceSecret) {
    setStepError(2, 'No device secret found in ID token. This step may be skipped for interclient_access flow.');
    return;
  }

  setStepComplete(2);
  showStepResult(2, `<div class="result-box">Device secret extracted.\nLength: ${deviceSecret.length} characters</div>`);

  // Unlock step 3
  unlockStep(3);
  document.getElementById('btn-step-3').disabled = false;
}

async function exchangeForWebSsoToken() {
  const cfg = getConfig();

  if (!idToken || !deviceSecret) {
    showDialog('Missing ID token or device secret. Complete Steps 1-2 first.');
    return;
  }

  if (!cfg.webClientId) {
    showDialog('Please configure Web App Client ID.');
    return;
  }

  setStepLoading(3, true);
  clearStepResult(3);

  try {
    const res = await fetch('/api/native-to-web/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: cfg,
        idToken,
        deviceSecret,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Token exchange failed');

    webSsoToken = data.access_token || data.web_sso_token;

    setStepComplete(3);
    showStepResult(3, `<div class="result-box">Web SSO token received.\nToken Type: ${data.issued_token_type || 'web_sso_token'}</div>`);

    if (data.curl) {
      document.getElementById('curl-3').textContent = data.curl;
    }

    // Unlock step 4
    unlockStep(4);
    document.getElementById('btn-step-4').disabled = false;
  } catch (err) {
    setStepError(3, err.message);
  } finally {
    setStepLoading(3, false);
  }
}

async function launchWebSession() {
  const cfg = getConfig();

  if (!webSsoToken) {
    showDialog('No Web SSO token available. Complete Step 4 first.');
    return;
  }

  if (!cfg.webClientId || !cfg.webRedirectUri) {
    showDialog('Please configure Web App Client ID and Redirect URI.');
    return;
  }

  // Use web app auth server for the authorize endpoint
  const webAuthServerId = getWebAuthServerId();
  const basePath = webAuthServerId ? `/oauth2/${webAuthServerId}/v1` : '/oauth2/v1';

  // Generate state and nonce
  const state = generateRandomString(16);
  const nonce = generateRandomString(16);

  // Build authorization URL with login_hint
  const webScopesStr = Array.from(webSelectedScopes).join(' ') || 'openid profile email';
  const params = new URLSearchParams({
    client_id: cfg.webClientId,
    response_type: 'code',
    scope: webScopesStr,
    redirect_uri: cfg.webRedirectUri,
    state: state,
    nonce: nonce,
    login_hint: webSsoToken,
  });

  const authUrl = `${cfg.oktaDomain}${basePath}/authorize?${params.toString()}`;

  // Update curl display
  document.getElementById('curl-4').textContent = authUrl;

  setStepComplete(4);
  showStepResult(4, `<div class="result-box">Launching web application with SSO token...</div>`);

  // Open the web app
  window.open(authUrl, '_blank');
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// --- Step UI Helpers ---

function setStepLoading(step, loading) {
  const btn = document.getElementById(`btn-step-${step}`);
  if (btn) btn.disabled = loading;
}

function setStepComplete(step) {
  const stepEl = document.getElementById(`step-${step}`);
  if (stepEl) {
    stepEl.classList.remove('error');
    stepEl.classList.add('completed');
  }
}

function setStepError(step, message) {
  const stepEl = document.getElementById(`step-${step}`);
  if (stepEl) {
    stepEl.classList.remove('completed');
    stepEl.classList.add('error');
  }
  showStepResult(step, `<div class="error-box">${message}</div>`);
  setStepLoading(step, false);
}

function unlockStep(step) {
  const stepEl = document.getElementById(`step-${step}`);
  if (stepEl) stepEl.classList.remove('locked');
}

function lockStep(step) {
  const stepEl = document.getElementById(`step-${step}`);
  if (stepEl) {
    stepEl.classList.add('locked');
    stepEl.classList.remove('completed', 'error');
  }
}

function showStepResult(step, html) {
  const el = document.getElementById(`result-${step}`);
  if (el) {
    el.innerHTML = html;
    el.classList.add('visible');
  }
}

function clearStepResult(step) {
  const el = document.getElementById(`result-${step}`);
  if (el) {
    el.innerHTML = '';
    el.classList.remove('visible');
  }
}

// --- Token Display ---

function switchTokenTab(tab) {
  document.querySelectorAll('.token-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.token-tab[data-tab="${tab}"]`)?.classList.add('active');

  const content = document.getElementById('token-content');
  let token = null;
  let data = null;

  switch (tab) {
    case 'id-token':
      token = idToken;
      break;
    case 'device-secret':
      data = deviceSecret;
      break;
    case 'web-sso-token':
      token = webSsoToken;
      break;
  }

  if (tab === 'device-secret') {
    if (!deviceSecret) {
      content.innerHTML = '<div class="token-empty">No device secret available. Complete Step 2.</div>';
    } else {
      content.innerHTML = `
        <div class="token-section">
          <h4>Device Secret</h4>
          <div class="token-raw-container">
            <button class="btn btn-secondary btn-small copy-raw-btn" onclick="copyDeviceSecret()">Copy</button>
            <div class="token-raw">${deviceSecret}</div>
          </div>
        </div>
      `;
    }
    return;
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
          <h4>Token</h4>
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
    case 'id-token': token = idToken; break;
    case 'web-sso-token': token = webSsoToken; break;
  }
  if (token) {
    navigator.clipboard.writeText(token);
    showDialog('Token copied to clipboard.');
  }
}

function copyDeviceSecret() {
  if (deviceSecret) {
    navigator.clipboard.writeText(deviceSecret);
    showDialog('Device secret copied to clipboard.');
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
  idToken = null;
  idTokenClaims = null;
  deviceSecret = null;
  webSsoToken = null;
  accessToken = null;
  refreshToken = null;
  mfaToken = null;
  stopMfaPolling();

  // Clear form inputs
  const usernameEl = document.getElementById('auth-username');
  const passwordEl = document.getElementById('auth-password');
  const otpEl = document.getElementById('auth-otp');
  const mfaOtpEl = document.getElementById('mfa-otp');
  if (usernameEl) usernameEl.value = '';
  if (passwordEl) passwordEl.value = '';
  if (otpEl) otpEl.value = '';
  if (mfaOtpEl) mfaOtpEl.value = '';

  document.getElementById('existing-id-token').value = '';
  document.getElementById('existing-token-panel').hidden = true;

  // Reset MFA UI
  const mfaForm = document.getElementById('mfa-form');
  if (mfaForm) mfaForm.hidden = true;
  const mfaStep = document.getElementById('step-mfa');
  if (mfaStep) {
    mfaStep.classList.remove('completed', 'error');
    mfaStep.classList.add('locked');
  }
  clearStepResult('mfa');

  // Reset UI for numbered steps
  for (let i = 1; i <= 4; i++) {
    clearStepResult(i);
    const stepEl = document.getElementById(`step-${i}`);
    if (stepEl) {
      stepEl.classList.remove('completed', 'error');
      if (i > 1) stepEl.classList.add('locked');
    }
  }

  document.getElementById('btn-step-2').disabled = true;
  document.getElementById('btn-step-3').disabled = true;
  document.getElementById('btn-step-4').disabled = true;
  document.getElementById('token-details').hidden = true;

  updateCurlCommands();

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
window.copyDeviceSecret = copyDeviceSecret;
