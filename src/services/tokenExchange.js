import { createAgenticClientAssertion } from './jwtService.js';
import * as logger from './logger.js';

/**
 * Agentic Step 2: Exchange token for ID-JAG token via RFC 8693 Token Exchange.
 * Uses JWT client assertion with principalId.
 * @param {object} cfg - Configuration object
 * @param {string} subjectToken - The token to exchange (access_token or id_token)
 * @param {string} subjectTokenType - Type of subject token ('access_token' or 'id_token')
 */
export async function agenticExchangeForIdJag(cfg, subjectToken, subjectTokenType = 'access_token') {
  // Determine token endpoint based on auth server selection
  let tokenEndpoint;
  if (cfg.step2AuthServer === 'default') {
    tokenEndpoint = `${cfg.oktaDomain}/oauth2/default/v1/token`;
  } else if (cfg.step2AuthServer === 'custom' && cfg.authorizationServerId) {
    tokenEndpoint = `${cfg.oktaDomain}/oauth2/${cfg.authorizationServerId}/v1/token`;
  } else {
    // 'org' or default
    tokenEndpoint = `${cfg.oktaDomain}/oauth2/v1/token`;
  }

  // Create JWT client assertion using principalId
  const clientAssertion = await createAgenticClientAssertion(cfg, tokenEndpoint);

  // Compute audience for the ID-JAG (points to the custom auth server)
  const audience = cfg.authorizationServerId
    ? `${cfg.oktaDomain}/oauth2/${cfg.authorizationServerId}`
    : cfg.oktaDomain;

  // Build subject_token_type URN
  const subjectTokenTypeUrn = `urn:ietf:params:oauth:token-type:${subjectTokenType}`;

  // Use configured scope or 'null' if none selected
  const scope = (cfg.tokenExchangeScope && cfg.tokenExchangeScope.trim())
    ? cfg.tokenExchangeScope.trim()
    : 'null';

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: subjectTokenTypeUrn,
    requested_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
    audience: audience,
    scope: scope,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  const curl = logger.logCurl(2, 'POST', tokenEndpoint, params.toString());
  logger.logRequest(2, 'POST', tokenEndpoint, params.toString());

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.logResponse(2, response.status, error);
    throw new Error(`[Agentic Token Exchange] Failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  // Log the full response for debugging
  logger.logResponse(2, response.status, result);
  result._curl = curl;
  return result;
}

/**
 * Agentic Step 3: Exchange ID-JAG token for Auth Server token via JWT Bearer grant (RFC 7523).
 * Uses JWT client assertion with principalId.
 */
export async function agenticExchangeIdJagForAuthServerToken(cfg, idJagToken) {
  // Use step3AuthServerId if provided, otherwise fall back to authorizationServerId
  const authServerId = cfg.step3AuthServerId || cfg.authorizationServerId;
  const tokenEndpoint = `${cfg.oktaDomain}/oauth2/${authServerId}/v1/token`;

  // Create JWT client assertion using principalId
  const clientAssertion = await createAgenticClientAssertion(cfg, tokenEndpoint);

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: idJagToken,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  const curl = logger.logCurl(3, 'POST', tokenEndpoint, params.toString());
  logger.logRequest(3, 'POST', tokenEndpoint, params.toString());

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.logResponse(3, response.status, error);
    throw new Error(`[Agentic JWT Bearer Grant] Failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  logger.logResponse(3, response.status, { token_type: result.token_type, expires_in: result.expires_in });
  result._curl = curl;
  return result;
}
