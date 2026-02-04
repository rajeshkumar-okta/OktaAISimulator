import { Router } from 'express';
import { decodeJwt } from 'jose';
import { validateAgenticConfig } from '../config.js';
import * as store from '../state/sessionStore.js';
import { agenticExchangeForIdJag, agenticExchangeIdJagForAuthServerToken } from '../services/tokenExchange.js';
import * as logger from '../services/logger.js';

const router = Router();

/**
 * GET /api/steps/state
 * Return current state of all steps.
 */
router.get('/state', (req, res) => {
  res.json(store.getState());
});

/**
 * POST /api/steps/reset
 * Reset all state and start a new log session.
 */
router.post('/reset', (req, res) => {
  store.reset();
  const userName = req.body?.userName || null;
  const flowType = req.body?.flowType || 'agentic-token-exchange';
  logger.startSession(flowType, userName);
  logger.log('-', 'Session started (reset)');
  res.json({ ok: true });
});

/**
 * POST /api/steps/set-token
 * Store an existing token (for "Use Existing" feature).
 * Body: { tokenType: 'id_token' | 'access_token', token: string }
 */
router.post('/set-token', (req, res) => {
  const { tokenType, token, userName } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  if (!tokenType || !['id_token', 'access_token'].includes(tokenType)) {
    return res.status(400).json({ error: 'tokenType must be "id_token" or "access_token"' });
  }

  // Start a new session for this flow
  logger.startSession('agentic-token-exchange', userName || null);
  logger.log(1, 'Using existing token', { tokenType });

  // Store the token
  if (tokenType === 'id_token') {
    store.set('idToken', token);
    store.set('accessToken', null);
  } else {
    store.set('accessToken', token);
    store.set('idToken', null);
  }

  // Try to decode and store claims if it's a JWT
  try {
    const claims = decodeJwt(token);
    if (tokenType === 'id_token') {
      store.set('idTokenClaims', claims);
    }
    logger.log(1, 'Token stored successfully', { sub: claims.sub, iss: claims.iss });
  } catch {
    logger.log(1, 'Token stored (opaque token)');
  }

  res.json({ ok: true });
});

/**
 * Middleware: validate config for agentic token exchange routes.
 */
function withAgenticConfig(req, res, next) {
  const cfg = req.body.config;
  if (!cfg) {
    return res.status(400).json({ error: '[Local App] No config provided in request body' });
  }
  const err = validateAgenticConfig(cfg);
  if (err) return res.status(400).json({ error: err });
  req.cfg = cfg;
  next();
}

// =============================================================================
// AGENTIC TOKEN EXCHANGE FLOW ROUTES
// =============================================================================

/**
 * POST /api/steps/agentic/2
 * Agentic Token Exchange: Exchange token for ID-JAG token.
 * Uses JWT client assertion with principalId.
 * Supports both access_token and id_token as subject token.
 */
router.post('/agentic/2', withAgenticConfig, async (req, res) => {
  try {
    // Determine which token to use based on subjectTokenType
    const subjectTokenType = req.cfg.subjectTokenType || 'access_token';
    let subjectToken;

    if (subjectTokenType === 'id_token') {
      subjectToken = store.get('idToken');
      if (!subjectToken) {
        return res.status(400).json({ error: '[Local App] No ID token available. Complete Step 1 first.' });
      }
    } else {
      subjectToken = store.get('accessToken');
      if (!subjectToken) {
        return res.status(400).json({ error: '[Local App] No access token available. Complete Step 1 first.' });
      }
    }

    if (!req.cfg.principalId) {
      return res.status(400).json({ error: '[Local App] Principal ID (Agent/Workload ID) is required.' });
    }

    if (!req.cfg.privateJwk) {
      return res.status(400).json({ error: '[Local App] Private JWK is required for JWT client assertion.' });
    }

    logger.log(2, 'Agentic Token Exchange (RFC 8693) — exchanging token for ID-JAG', {
      principalId: req.cfg.principalId,
      subjectTokenType: subjectTokenType,
      authServer: req.cfg.step2AuthServer || 'org',
      audience: req.cfg.authorizationServerId ? `${req.cfg.oktaDomain}/oauth2/${req.cfg.authorizationServerId}` : req.cfg.oktaDomain,
    });

    const result = await agenticExchangeForIdJag(req.cfg, subjectToken, subjectTokenType);

    const idJagToken = result.access_token;
    const claims = decodeJwt(idJagToken);

    logger.log(2, 'Agentic Step 2 complete — ID-JAG token received', {
      tokenType: result.token_type,
      issuedTokenType: result.issued_token_type,
      expiresIn: result.expires_in,
      claims,
    });

    const stepResult = {
      tokenType: result.token_type,
      issuedTokenType: result.issued_token_type,
      expiresIn: result.expires_in,
      scope: result.scope,
      claims,
    };

    store.set('idJagToken', idJagToken);
    store.set('idJagResult', stepResult);

    res.json({ ...stepResult, idJagToken, curl: result._curl });
  } catch (err) {
    const logTs = logger.logError(2, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/steps/agentic/3
 * Agentic JWT Bearer Grant: Exchange ID-JAG for Auth Server access token.
 * Uses JWT client assertion with principalId.
 */
router.post('/agentic/3', withAgenticConfig, async (req, res) => {
  try {
    const idJagToken = store.get('idJagToken');
    if (!idJagToken) {
      return res.status(400).json({ error: '[Local App] No ID-JAG token available. Complete Step 2 first.' });
    }

    // Determine the auth server ID for Step 3 based on picker selection
    let step3AuthServerId;
    const step3AuthServer = req.cfg.step3AuthServer || 'custom';
    if (step3AuthServer === 'org') {
      step3AuthServerId = '';
    } else if (step3AuthServer === 'default') {
      step3AuthServerId = 'default';
    } else if (step3AuthServer === 'alternate') {
      step3AuthServerId = req.cfg.step3AuthServerId || '';
    } else {
      // 'custom' - use the configured authorizationServerId
      step3AuthServerId = req.cfg.authorizationServerId || '';
    }

    if (!step3AuthServerId) {
      return res.status(400).json({ error: '[Local App] Authorization Server ID is required for Step 3.' });
    }

    if (!req.cfg.principalId) {
      return res.status(400).json({ error: '[Local App] Principal ID (Agent/Workload ID) is required.' });
    }

    if (!req.cfg.privateJwk) {
      return res.status(400).json({ error: '[Local App] Private JWK is required for JWT client assertion.' });
    }

    // Build token endpoint based on auth server selection
    const tokenEndpoint = `${req.cfg.oktaDomain}/oauth2/${step3AuthServerId}/v1/token`;

    logger.log(3, 'Agentic JWT Bearer Grant (RFC 7523) — exchanging ID-JAG for Auth Server token', {
      principalId: req.cfg.principalId,
      authServer: step3AuthServer,
      tokenEndpoint: tokenEndpoint,
    });

    // Pass step3AuthServerId to the token exchange function
    const configWithStep3 = { ...req.cfg, step3AuthServerId };
    const result = await agenticExchangeIdJagForAuthServerToken(configWithStep3, idJagToken);

    const authServerToken = result.access_token;
    const claims = decodeJwt(authServerToken);

    logger.log(3, 'Agentic Step 3 complete — Auth Server token received', {
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      claims,
    });

    const stepResult = {
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      scope: result.scope,
      claims,
    };

    store.set('authServerToken', authServerToken);
    store.set('authServerResult', stepResult);

    res.json({ ...stepResult, authServerToken, curl: result._curl });
  } catch (err) {
    const logTs = logger.logError(3, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/steps/agentic/4
 * Test Access Token with API: Make an authenticated API request.
 */
router.post('/agentic/4', async (req, res) => {
  try {
    const { method, url, body, accessToken } = req.body;

    if (!url) {
      return res.status(400).json({ error: '[Local App] API URL is required.' });
    }

    if (!accessToken) {
      return res.status(400).json({ error: '[Local App] Access token is required. Complete Step 3 first.' });
    }

    logger.log(4, 'Testing Access Token with API', {
      method,
      url,
      hasBody: !!body,
    });

    // Build curl command for logging
    let curlCmd = `curl --request ${method} \\\n  --url "${url}" \\\n  -H "Authorization: Bearer ${accessToken}"`;
    if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
      curlCmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
    }
    logger.log(4, 'cURL command', { curl: curlCmd });

    // Make the API request
    const fetchOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = body;
    }

    const apiResponse = await fetch(url, fetchOptions);
    const apiStatus = apiResponse.status;

    let apiResponseBody;
    const contentType = apiResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      apiResponseBody = await apiResponse.json();
    } else {
      apiResponseBody = await apiResponse.text();
    }

    logger.log(4, 'API Response', {
      status: apiStatus,
      contentType,
      response: apiResponseBody,
    });

    if (apiResponse.ok) {
      logger.log(4, 'Step 4 complete — API request successful');
    } else {
      logger.log(4, 'API request returned error status', { status: apiStatus });
    }

    res.json({
      apiStatus,
      apiResponse: apiResponseBody,
      curl: curlCmd,
    });
  } catch (err) {
    const logTs = logger.logError(4, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

export default router;
