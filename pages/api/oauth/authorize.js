import crypto from 'crypto';
import { decodeJwt } from 'jose';
import { validateBasicOAuthConfig } from '../../../src/config';
import * as store from '../../../src/state/sessionStore-serverless';
import * as logger from '../../../src/services/logger-serverless';

/**
 * Next.js API Route - OAuth Authorization
 * POST /api/oauth/authorize
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cfg = req.body;
    const err = validateBasicOAuthConfig(cfg);
    if (err) return res.status(400).json({ error: err });

    // Start a new session log
    const sessionType = cfg.sessionType || 'auth-code-flow';
    const userName = cfg.userName || null;
    logger.startSession(sessionType, userName);

    // Use step1AuthServerId if provided, otherwise fall back to authorizationServerId
    const step1AuthServerId = cfg.step1AuthServerId !== undefined 
      ? cfg.step1AuthServerId 
      : cfg.authorizationServerId;

    logger.log(1, 'OAuth Authorize initiated', {
      oktaDomain: cfg.oktaDomain,
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      authorizationServerId: step1AuthServerId || '(org)',
      clientAuthMethod: cfg.clientAuthMethod || 'client_secret',
      responseType: cfg.responseType || 'code',
    });

    // Generate or use custom state/nonce
    const oauthState = cfg.customState || crypto.randomBytes(16).toString('hex');
    const oauthNonce = cfg.customNonce || crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = Buffer.from(
      crypto.createHash('sha256').update(codeVerifier).digest()
    ).toString('base64url');

    // Store in serverless session
    store.setState({
      oauthState,
      oauthNonce,
      codeVerifier,
      cfg,
    });

    logger.log(2, 'Generated OAuth parameters', {
      state: oauthState,
      nonce: oauthNonce,
      codeChallenge,
      pkce: cfg.usePkce ? 'enabled' : 'disabled',
    });

    const oauthPath = getOAuthPath(step1AuthServerId);
    
    // Ensure oktaDomain is clean (remove protocol and trailing slash)
    let cleanDomain = cfg.oktaDomain
      .replace(/^https?:\/\//, '') // Remove https:// or http://
      .replace(/\/$/, ''); // Remove trailing slash
    
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: cfg.responseType || 'code',
      scope: cfg.scope || 'openid profile email',
      redirect_uri: cfg.redirectUri,
      state: oauthState,
      nonce: oauthNonce,
      ...(cfg.usePkce && { code_challenge: codeChallenge, code_challenge_method: 'S256' }),
      ...(cfg.loginHint && { login_hint: cfg.loginHint }),
      ...(cfg.idpHint && { idp: cfg.idpHint }),
      ...(cfg.prompt && { prompt: cfg.prompt }),
      ...(cfg.maxAge && { max_age: cfg.maxAge }),
    });

    const authUrl = `https://${cleanDomain}/${oauthPath}/authorize?${params.toString()}`;

    logger.log(3, 'Authorization URL generated', {
      url: authUrl.replace(/client_id=[^&]+/, 'client_id=***'),
    });

    res.json({
      authUrl,
      state: oauthState,
      nonce: oauthNonce,
      codeVerifier: cfg.usePkce ? codeVerifier : undefined,
      sessionId: logger.getSessionMeta().sessionId,
    });
  } catch (error) {
    logger.log(0, 'Error in OAuth authorize', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get the OAuth path prefix based on authorization server ID
 */
function getOAuthPath(authorizationServerId) {
  if (!authorizationServerId) {
    return 'oauth2/v1';
  }
  return `oauth2/${authorizationServerId}/v1`;
}
