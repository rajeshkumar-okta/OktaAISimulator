// Setup Wizard Application

const CURRENT_USER_KEY = 'okta_current_user';
const IDP_CONFIG_KEY = 'okta_idp_config';

let currentStep = 1;
const totalSteps = 3;

let authSuccessful = false;
let userClaims = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Display the redirect URI
  const redirectUri = `${window.location.origin}/callback`;
  document.getElementById('redirect-uri').textContent = redirectUri;

  // Auto-correct Okta admin URLs
  const domainInput = document.getElementById('oktaDomain');
  domainInput.addEventListener('input', autoCorrectOktaDomain);
  domainInput.addEventListener('paste', () => {
    // Delay to allow paste to complete
    setTimeout(autoCorrectOktaDomain, 0);
  });

  // Button handlers
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-back').addEventListener('click', handleBack);
  document.getElementById('btn-authenticate').addEventListener('click', handleAuthenticate);

  // Listen for OAuth callback
  const channel = new BroadcastChannel('oauth-callback');
  channel.onmessage = (event) => handleOAuthResult(event.data);
  window.addEventListener('message', (event) => {
    if (event.origin === window.location.origin) {
      handleOAuthResult(event.data);
    }
  });

  updateUI();
}

function updateUI() {
  // Update progress indicators
  document.querySelectorAll('.progress-step').forEach((el, index) => {
    const stepNum = index + 1;
    el.classList.remove('active', 'complete');
    if (stepNum < currentStep) {
      el.classList.add('complete');
    } else if (stepNum === currentStep) {
      el.classList.add('active');
    }
  });

  // Show/hide steps
  document.querySelectorAll('.step').forEach((el, index) => {
    el.classList.toggle('active', index + 1 === currentStep);
  });

  // Update buttons
  const backBtn = document.getElementById('btn-back');
  const nextBtn = document.getElementById('btn-next');

  backBtn.disabled = currentStep === 1;

  switch (currentStep) {
    case 1:
      nextBtn.textContent = 'Get Started';
      nextBtn.className = 'btn btn-primary';
      nextBtn.disabled = false;
      break;
    case 2:
      nextBtn.textContent = 'Continue';
      nextBtn.className = 'btn btn-primary';
      nextBtn.disabled = false;
      break;
    case 3:
      if (authSuccessful) {
        nextBtn.textContent = 'Complete Setup';
        nextBtn.className = 'btn btn-success';
        nextBtn.disabled = false;
      } else {
        nextBtn.textContent = 'Authenticate First';
        nextBtn.className = 'btn btn-primary';
        nextBtn.disabled = true;
      }
      break;
  }
}

function handleNext() {
  if (currentStep === 2) {
    // Validate configuration
    if (!validateConfig()) {
      return;
    }
  }

  if (currentStep === 3 && authSuccessful) {
    // Complete setup
    completeSetup();
    return;
  }

  if (currentStep < totalSteps) {
    currentStep++;
    updateUI();
  }
}

function handleBack() {
  if (currentStep > 1) {
    currentStep--;
    // Reset auth state if going back from step 3
    if (currentStep < 3) {
      authSuccessful = false;
      userClaims = null;
      document.getElementById('auth-pending').classList.remove('hidden');
      document.getElementById('auth-success').classList.add('hidden');
    }
    updateUI();
  }
}

function validateConfig() {
  const oktaDomain = document.getElementById('oktaDomain').value.trim();
  const clientId = document.getElementById('clientId').value.trim();
  const clientSecret = document.getElementById('clientSecret').value.trim();

  const errorEl = document.getElementById('config-error');

  if (!oktaDomain) {
    showError(errorEl, 'Authorization Server URL is required');
    return false;
  }

  if (!oktaDomain.startsWith('https://')) {
    showError(errorEl, 'Authorization Server URL must start with https://');
    return false;
  }

  if (!clientId) {
    showError(errorEl, 'Client ID is required');
    return false;
  }

  if (!clientSecret) {
    showError(errorEl, 'Client Secret is required');
    return false;
  }

  hideError(errorEl);
  return true;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.add('visible');
}

function hideError(el) {
  el.classList.remove('visible');
}

function getConfig() {
  return {
    oktaDomain: document.getElementById('oktaDomain').value.trim().replace(/\/$/, ''),
    clientId: document.getElementById('clientId').value.trim(),
    clientSecret: document.getElementById('clientSecret').value.trim(),
    redirectUri: `${window.location.origin}/callback`,
    clientAuthMethod: 'client_secret',
  };
}

async function handleAuthenticate() {
  const cfg = getConfig();
  const errorEl = document.getElementById('auth-error');
  hideError(errorEl);

  const btn = document.getElementById('btn-authenticate');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Authenticating...';

  try {
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authorization request failed');
    }

    // Open OAuth login popup
    const w = 500, h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      data.authUrl,
      'idp-login',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups for this site.');
    }

    // Poll for popup close
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        if (!authSuccessful) {
          btn.disabled = false;
          btn.textContent = 'Login with IdP';
          showError(errorEl, 'Login window was closed before completing.');
        }
      }
    }, 500);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Login with IdP';
    showError(errorEl, err.message);
  }
}

function handleOAuthResult(data) {
  if (!data || data.type !== 'oauth-callback') return;

  const btn = document.getElementById('btn-authenticate');
  const errorEl = document.getElementById('auth-error');

  if (data.error) {
    btn.disabled = false;
    btn.textContent = 'Login with IdP';
    showError(errorEl, data.error);
    return;
  }

  if (data.success && data.claims) {
    authSuccessful = true;
    userClaims = data.claims;

    // Show success UI
    document.getElementById('auth-pending').classList.add('hidden');
    document.getElementById('auth-success').classList.remove('hidden');

    // Populate user info
    document.getElementById('user-sub').textContent = data.claims.sub || '-';
    document.getElementById('user-name').textContent = data.claims.name || '-';
    document.getElementById('user-email').textContent = data.claims.email || '-';
    document.getElementById('user-iss').textContent = data.claims.iss || '-';

    // Save user to localStorage
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
      sub: data.claims.sub,
      name: data.claims.name,
      email: data.claims.email,
      iss: data.claims.iss,
      authenticatedAt: new Date().toISOString(),
    }));

    updateUI();
  }
}

async function completeSetup() {
  const cfg = getConfig();
  const nextBtn = document.getElementById('btn-next');

  nextBtn.disabled = true;
  nextBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';

  try {
    // Save IdP configuration to server
    const res = await fetch('/api/idps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: extractDomainName(cfg.oktaDomain),
        config: {
          oktaDomain: cfg.oktaDomain,
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
        },
        createdBy: userClaims?.sub || 'unknown',
        isPrimary: true,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save IdP configuration');
    }

    // Also save to localStorage for quick access
    localStorage.setItem(IDP_CONFIG_KEY, JSON.stringify({
      oktaDomain: cfg.oktaDomain,
      clientId: cfg.clientId,
      // Don't store client secret in localStorage
    }));

    // Redirect to main application
    window.location.href = '/';

  } catch (err) {
    nextBtn.disabled = false;
    nextBtn.textContent = 'Complete Setup';
    const errorEl = document.getElementById('auth-error');
    showError(errorEl, err.message);
  }
}

function extractDomainName(url) {
  try {
    const hostname = new URL(url).hostname;
    // Extract the subdomain or main part
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ' IdP';
    }
    return hostname + ' IdP';
  } catch {
    return 'Primary IdP';
  }
}

/**
 * Auto-correct Okta admin URLs by removing "-admin" from the domain.
 * e.g., https://dev-12345-admin.okta.com -> https://dev-12345.okta.com
 */
function autoCorrectOktaDomain() {
  const input = document.getElementById('oktaDomain');
  const value = input.value;

  // Check if the URL contains -admin.okta or -admin.oktapreview
  const corrected = value.replace(/-admin\.(okta|oktapreview|okta-emea|okta-gov)/gi, '.$1');

  if (corrected !== value) {
    input.value = corrected;
    // Show a brief visual indicator that correction happened
    input.style.backgroundColor = '#d1fae5';
    setTimeout(() => {
      input.style.backgroundColor = '';
    }, 1000);
  }
}
