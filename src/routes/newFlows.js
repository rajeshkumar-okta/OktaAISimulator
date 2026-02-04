import { Router } from 'express';
import { createClientAssertion } from '../services/jwtService.js';
import * as logger from '../services/logger.js';

const router = Router();

// =============================================================================
// DEVICE AUTHORIZATION GRANT FLOW
// =============================================================================

/**
 * POST /api/device/authorize
 * Request a device code from the authorization server.
 */
router.post('/device/authorize', async (req, res) => {
  try {
    const cfg = req.body.config;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId) {
      return res.status(400).json({ error: 'Missing required configuration' });
    }

    const authServerId = cfg.authorizationServerId;
    const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
    const deviceEndpoint = `${cfg.oktaDomain}${basePath}/device/authorize`;

    logger.startSession('device-grant-flow', null);
    logger.log(1, 'Requesting device code', { endpoint: deviceEndpoint });

    const body = new URLSearchParams({
      client_id: cfg.clientId,
      scope: cfg.scopes || 'openid profile email',
    });

    const curlCmd = `curl --request POST \\
  --url "${deviceEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${cfg.clientId}" \\
  -d "scope=${cfg.scopes || 'openid profile email'}"`;

    logger.log(1, 'cURL command', { curl: curlCmd });

    const response = await fetch(deviceEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.logError(1, new Error(data.error_description || data.error));
      return res.status(response.status).json(data);
    }

    logger.log(1, 'Device code received', {
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
    });

    res.json({ ...data, curl: curlCmd });
  } catch (err) {
    const logTs = logger.logError(1, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/device/token
 * Poll for access token using device code.
 */
router.post('/device/token', async (req, res) => {
  try {
    const { config: cfg, deviceCode } = req.body;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId || !deviceCode) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId;
    const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: cfg.clientId,
      device_code: deviceCode,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      // Return error without logging (expected during polling)
      return res.status(response.status).json(data);
    }

    logger.log(3, 'Token received', {
      token_type: data.token_type,
      expires_in: data.expires_in,
    });

    res.json(data);
  } catch (err) {
    const logTs = logger.logError(3, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

// =============================================================================
// TOKEN EXCHANGE FLOW
// =============================================================================

/**
 * POST /api/token-exchange/exchange
 * Exchange a subject token for a new token (RFC 8693).
 */
router.post('/token-exchange/exchange', async (req, res) => {
  try {
    const { config: cfg, subjectToken, subjectTokenType } = req.body;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId || !subjectToken) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId;
    const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    logger.startSession('token-exchange-flow', null);
    logger.log(2, 'Token Exchange (RFC 8693)', { endpoint: tokenEndpoint });

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: subjectTokenType || 'urn:ietf:params:oauth:token-type:access_token',
    });

    if (cfg.scopes) {
      body.append('scope', cfg.scopes);
    }

    if (cfg.audience) {
      body.append('audience', cfg.audience);
    }

    if (cfg.requestedTokenType) {
      body.append('requested_token_type', cfg.requestedTokenType);
    }

    if (cfg.actorTokenType && cfg.actorToken) {
      body.append('actor_token', cfg.actorToken);
      body.append('actor_token_type', cfg.actorTokenType);
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let curlAuth = '';

    if (cfg.clientAuthMethod === 'client_secret' && cfg.clientSecret) {
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
      curlAuth = `-H "Authorization: Basic ${auth}"`;
    } else if (cfg.clientAuthMethod === 'private_key' && cfg.privateJwk) {
      const assertion = await createClientAssertion(cfg);
      body.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      body.append('client_assertion', assertion);
    } else {
      body.append('client_id', cfg.clientId);
    }

    const curlCmd = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" ${curlAuth ? '\\' : ''}
${curlAuth ? `  ${curlAuth} \\` : ''}  -d "${body.toString().replace(/&/g, '" \\\n  -d "')}"`;

    logger.log(2, 'cURL command', { curl: curlCmd });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.logError(2, new Error(data.error_description || data.error));
      return res.status(response.status).json({ ...data, curl: curlCmd });
    }

    logger.log(2, 'Token exchange successful', {
      token_type: data.token_type,
      issued_token_type: data.issued_token_type,
      expires_in: data.expires_in,
    });

    res.json({ ...data, curl: curlCmd });
  } catch (err) {
    const logTs = logger.logError(2, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/token-exchange/verify
 * Verify an exchanged token.
 */
router.post('/token-exchange/verify', async (req, res) => {
  try {
    const { config: cfg, token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    logger.log(3, 'Verifying exchanged token');

    // Try to decode the token
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.json({ valid: true, type: 'opaque', message: 'Token is opaque (not a JWT)' });
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Basic validation
    const now = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp && payload.exp < now;

    logger.log(3, 'Token verified', {
      valid: !isExpired,
      sub: payload.sub,
      iss: payload.iss,
    });

    res.json({
      valid: !isExpired,
      header,
      payload,
      expired: isExpired,
      sub: payload.sub,
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
    });
  } catch (err) {
    const logTs = logger.logError(3, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

// =============================================================================
// NATIVE TO WEB SSO FLOW
// =============================================================================

/**
 * POST /api/native-to-web/exchange
 * Exchange ID token + device secret for web SSO token.
 */
router.post('/native-to-web/exchange', async (req, res) => {
  try {
    const { config: cfg, idToken, deviceSecret } = req.body;
    if (!cfg || !cfg.oktaDomain || !idToken || !deviceSecret) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId;
    const basePath = authServerId ? `/oauth2/${authServerId}/v1` : '/oauth2/v1';
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    logger.startSession('native-to-web-flow', null);
    logger.log(3, 'Token Exchange for Web SSO Token', { endpoint: tokenEndpoint });

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:okta:oauth:token-type:web_sso_token',
      actor_token: deviceSecret,
      actor_token_type: 'urn:x-okta:params:oauth:token-type:device-secret',
      audience: `urn:okta:apps:${cfg.webClientId}`,
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let curlAuth = '';

    if (cfg.nativeClientSecret) {
      const auth = Buffer.from(`${cfg.nativeClientId}:${cfg.nativeClientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
      curlAuth = `-H "Authorization: Basic ${auth}"`;
    } else {
      body.append('client_id', cfg.nativeClientId);
    }

    const curlCmd = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" ${curlAuth ? '\\' : ''}
${curlAuth ? `  ${curlAuth} \\` : ''}  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\
  -d "subject_token=<ID_TOKEN>" \\
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \\
  -d "requested_token_type=urn:okta:oauth:token-type:web_sso_token" \\
  -d "actor_token=<DEVICE_SECRET>" \\
  -d "actor_token_type=urn:x-okta:params:oauth:token-type:device-secret" \\
  -d "audience=urn:okta:apps:${cfg.webClientId}"`;

    logger.log(3, 'cURL command', { curl: curlCmd });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.logError(3, new Error(data.error_description || data.error));
      return res.status(response.status).json({ ...data, curl: curlCmd });
    }

    logger.log(3, 'Web SSO token received', {
      token_type: data.token_type,
      issued_token_type: data.issued_token_type,
    });

    res.json({ ...data, curl: curlCmd });
  } catch (err) {
    const logTs = logger.logError(3, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

// =============================================================================
// DIRECT AUTHENTICATION FLOW
// =============================================================================

/**
 * POST /api/direct-auth/authenticate
 * Primary authentication using direct authentication grants.
 */
router.post('/direct-auth/authenticate', async (req, res) => {
  try {
    const { config: cfg, username, password, otp } = req.body;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId || !username) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId || 'default';
    const basePath = `/oauth2/${authServerId}/v1`;
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    logger.startSession('direct-auth-flow', username);
    logger.log(1, 'Primary authentication', { username, method: cfg.authMethod || 'password' });

    const body = new URLSearchParams();

    const authMethod = cfg.authMethod || 'password';

    if (authMethod === 'password') {
      body.append('grant_type', 'password');
      body.append('username', username);
      body.append('password', password || '');
    } else if (authMethod === 'otp') {
      body.append('grant_type', 'urn:okta:params:oauth:grant-type:otp');
      body.append('login_hint', username);
      body.append('otp', otp || '');
    } else if (authMethod === 'oob') {
      body.append('grant_type', 'urn:okta:params:oauth:grant-type:oob');
      body.append('login_hint', username);
      body.append('channel_hint', 'push');
    }

    if (cfg.scopes) {
      body.append('scope', cfg.scopes);
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let curlAuth = '';

    if (cfg.clientSecret) {
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
      curlAuth = `-H "Authorization: Basic ${auth}"`;
    } else {
      body.append('client_id', cfg.clientId);
    }

    const curlCmd = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" ${curlAuth ? '\\' : ''}
${curlAuth ? `  ${curlAuth} \\` : ''}  -d "${body.toString().replace(/&/g, '" \\\n  -d "')}"`;

    logger.log(1, 'cURL command', { curl: curlCmd });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      // Check for MFA required
      if (data.error === 'mfa_required' && data.mfa_token) {
        logger.log(1, 'MFA required', { mfa_token: data.mfa_token });
        return res.json({
          mfa_token: data.mfa_token,
          mfa_type: data.mfa_type,
          oob_data: data.oob_code ? { oob_code: data.oob_code, channel: data.channel } : null,
          curl: curlCmd,
        });
      }

      logger.logError(1, new Error(data.error_description || data.error));
      return res.status(response.status).json({ ...data, curl: curlCmd });
    }

    logger.log(1, 'Authentication successful', {
      token_type: data.token_type,
      expires_in: data.expires_in,
    });

    res.json({ ...data, curl: curlCmd });
  } catch (err) {
    const logTs = logger.logError(1, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/direct-auth/mfa
 * Complete MFA verification.
 */
router.post('/direct-auth/mfa', async (req, res) => {
  try {
    const { config: cfg, mfaToken, otp, oobCode } = req.body;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId || !mfaToken) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId || 'default';
    const basePath = `/oauth2/${authServerId}/v1`;
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    logger.log(2, 'MFA verification');

    const body = new URLSearchParams({
      grant_type: 'urn:okta:params:oauth:grant-type:mfa-otp',
      mfa_token: mfaToken,
    });

    if (otp) {
      body.append('otp', otp);
    }

    if (oobCode) {
      body.set('grant_type', 'urn:okta:params:oauth:grant-type:mfa-oob');
      body.append('oob_code', oobCode);
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let curlAuth = '';

    if (cfg.clientSecret) {
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
      curlAuth = `-H "Authorization: Basic ${auth}"`;
    } else {
      body.append('client_id', cfg.clientId);
    }

    const curlCmd = `curl --request POST \\
  --url "${tokenEndpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" ${curlAuth ? '\\' : ''}
${curlAuth ? `  ${curlAuth} \\` : ''}  -d "${body.toString().replace(/&/g, '" \\\n  -d "')}"`;

    logger.log(2, 'cURL command', { curl: curlCmd });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      // authorization_pending is expected during OOB polling
      if (data.error === 'authorization_pending') {
        return res.status(200).json({ ...data, curl: curlCmd });
      }

      logger.logError(2, new Error(data.error_description || data.error));
      return res.status(response.status).json({ ...data, curl: curlCmd });
    }

    logger.log(2, 'MFA verification successful', {
      token_type: data.token_type,
      expires_in: data.expires_in,
    });

    res.json({ ...data, curl: curlCmd });
  } catch (err) {
    const logTs = logger.logError(2, err);
    res.status(500).json({ error: err.message, logTimestamp: logTs });
  }
});

/**
 * POST /api/direct-auth/mfa-poll
 * Poll for OOB MFA completion.
 */
router.post('/direct-auth/mfa-poll', async (req, res) => {
  try {
    const { config: cfg, mfaToken, oobCode } = req.body;
    if (!cfg || !cfg.oktaDomain || !cfg.clientId || !mfaToken || !oobCode) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const authServerId = cfg.authorizationServerId || 'default';
    const basePath = `/oauth2/${authServerId}/v1`;
    const tokenEndpoint = `${cfg.oktaDomain}${basePath}/token`;

    const body = new URLSearchParams({
      grant_type: 'urn:okta:params:oauth:grant-type:mfa-oob',
      mfa_token: mfaToken,
      oob_code: oobCode,
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (cfg.clientSecret) {
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else {
      body.append('client_id', cfg.clientId);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok && data.error !== 'authorization_pending') {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
