import { Router } from 'express';
import crypto from 'crypto';
import { decodeJwt } from 'jose';
import { validateBasicOAuthConfig } from '../config.js';
import * as store from '../state/sessionStore.js';
import * as logger from '../services/logger.js';

const router = Router();

/**
 * Get the OAuth path prefix based on authorization server ID.
 * - Empty/undefined: Org Authorization Server (oauth2/v1)
 * - 'default': Default Custom Auth Server (oauth2/default/v1)
 * - Other: Custom Auth Server (oauth2/{id}/v1)
 */
function getOAuthPath(authorizationServerId) {
  if (!authorizationServerId) {
    return 'oauth2/v1';
  }
  return `oauth2/${authorizationServerId}/v1`;
}

/**
 * POST /api/oauth/authorize
 * Accepts config in body, stores it, generates Okta auth URL.
 * Uses the specified authorization server (step1AuthServerId or authorizationServerId).
 */
router.post('/api/oauth/authorize', (req, res) => {
  const cfg = req.body;
  const err = validateBasicOAuthConfig(cfg);
  if (err) return res.status(400).json({ error: err });

  // Start a new session log - use sessionType if provided, default to auth-code-flow
  const sessionType = cfg.sessionType || 'auth-code-flow';
  const userName = cfg.userName || null;
  logger.startSession(sessionType, userName);

  // Use step1AuthServerId if provided (for agentic flow), otherwise fall back to authorizationServerId
  const step1AuthServerId = cfg.step1AuthServerId !== undefined ? cfg.step1AuthServerId : cfg.authorizationServerId;

  logger.log(1, 'OAuth Authorize initiated', {
    oktaDomain: cfg.oktaDomain,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    authorizationServerId: step1AuthServerId || '(org)',
    clientAuthMethod: cfg.clientAuthMethod || 'client_secret',
    responseType: cfg.responseType || 'code',
  });

  // Use custom state/nonce if specified, otherwise generate random values
  const state = (cfg.stateMode === 'specify' && cfg.state)
    ? cfg.state
    : crypto.randomBytes(32).toString('base64url');
  const nonce = (cfg.nonceMode === 'specify' && cfg.nonce)
    ? cfg.nonce
    : crypto.randomBytes(32).toString('base64url');

  store.set('oauthState', state);
  store.set('oauthNonce', nonce);
  store.set('cfg', cfg);
  // Store the step1AuthServerId separately for the callback
  store.set('step1AuthServerId', step1AuthServerId);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: cfg.responseType || 'code',
    scope: cfg.scopes || 'openid profile email',
    redirect_uri: cfg.redirectUri,
    state,
    nonce,
  });

  // For PKCE: generate code_verifier and code_challenge
  if (cfg.clientAuthMethod === 'pkce') {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    store.set('codeVerifier', codeVerifier);
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  const oauthPath = getOAuthPath(step1AuthServerId);
  const authUrl = `${cfg.oktaDomain}/${oauthPath}/authorize?${params.toString()}`;

  logger.log(1, 'Redirecting to Okta', { authUrl, authorizationServerId: step1AuthServerId || '(org)' });

  res.json({ authUrl });
});

/**
 * GET /callback
 * OAuth redirect handler. Exchanges authorization code for ID token.
 * Uses stored config from the authorize step.
 * Renders a page that posts the result back to the opener window via postMessage.
 */
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  logger.log(1, 'OAuth Callback received', {
    hasCode: !!code,
    stateMatch: state === store.get('oauthState'),
    error: error || null,
  });

  function sendResult(result) {
    const json = JSON.stringify(result);
    res.send(`<!DOCTYPE html><html><head><title>Login Complete</title></head><body>
      <p>Login complete. This window will close automatically.</p>
      <script>
        (function() {
          var data = ${json};
          var closed = false;

          // Primary: BroadcastChannel (works even when window.opener is severed by COOP)
          try {
            var bc = new BroadcastChannel('oauth-callback');
            bc.postMessage(data);
            bc.close();
          } catch(e) {}

          // Secondary: postMessage to opener (if available)
          if (window.opener) {
            try {
              window.opener.postMessage(data, window.location.origin);
            } catch(e) {}
          }

          // Close the popup
          try { window.close(); closed = true; } catch(e) {}

          // If window.close() didn't work, show a message
          if (!closed || !window.closed) {
            document.body.innerHTML = '<p>Login complete. You can close this window.</p>';
          }
        })();
      </script>
    </body></html>`);
  }

  if (error) {
    return sendResult({ type: 'oauth-callback', error: error_description || error });
  }

  if (state !== store.get('oauthState')) {
    return sendResult({ type: 'oauth-callback', error: 'Invalid state parameter' });
  }

  const cfg = store.get('cfg');
  if (!cfg) {
    return sendResult({ type: 'oauth-callback', error: 'No config found. Please start over.' });
  }

  try {
    // Use the step1AuthServerId that was stored during authorize
    const step1AuthServerId = store.get('step1AuthServerId');
    const oauthPath = getOAuthPath(step1AuthServerId);
    const tokenEndpoint = `${cfg.oktaDomain}/${oauthPath}/token`;
    const authMethod = cfg.clientAuthMethod || 'client_secret';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
      code,
    });

    if (authMethod === 'client_secret') {
      params.set('client_id', cfg.clientId);
      params.set('client_secret', cfg.clientSecret);
    } else if (authMethod === 'private_key') {
      const { createClientAssertion } = await import('../services/jwtService.js');
      const clientAssertion = await createClientAssertion(cfg, tokenEndpoint);
      params.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      params.set('client_assertion', clientAssertion);
    } else if (authMethod === 'pkce') {
      params.set('client_id', cfg.clientId);
      const codeVerifier = store.get('codeVerifier');
      if (codeVerifier) {
        params.set('code_verifier', codeVerifier);
      }
    }

    const curl = logger.logCurl(1, 'POST', tokenEndpoint, params.toString());
    logger.logRequest(1, 'POST', tokenEndpoint, params.toString());

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.logResponse(1, response.status, errBody);
      throw new Error(`[Okta Authorization Server] Token exchange failed (${response.status}): ${errBody}`);
    }

    const tokenResponse = await response.json();
    const idToken = tokenResponse.id_token;
    const accessToken = tokenResponse.access_token || null;
    const refreshToken = tokenResponse.refresh_token || null;

    if (!idToken) {
      throw new Error('[Okta Authorization Server] No id_token in token response');
    }

    const claims = decodeJwt(idToken);
    logger.logResponse(1, response.status, tokenResponse);
    logger.log(1, 'Step 1 complete — tokens obtained');

    store.set('idToken', idToken);
    store.set('accessToken', accessToken);
    store.set('refreshToken', refreshToken);
    store.set('idTokenClaims', claims);

    sendResult({ type: 'oauth-callback', success: true, claims, idToken, accessToken, refreshToken, curl });
  } catch (err) {
    const logTs = logger.logError(1, err);
    sendResult({ type: 'oauth-callback', error: err.message, logTimestamp: logTs });
  }
});

export default router;
