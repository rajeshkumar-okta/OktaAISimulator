import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
};

/**
 * Validate basic OAuth config for simple Authorization Code Flow.
 * Used by setup wizard and auth-code-flow pages.
 * Returns an error message string or null if valid.
 */
export function validateBasicOAuthConfig(cfg) {
  const required = ['oktaDomain', 'clientId', 'redirectUri'];

  const authMethod = cfg.clientAuthMethod || 'client_secret';

  // clientSecret only required for client_secret auth method
  if (authMethod === 'client_secret') {
    required.push('clientSecret');
  }

  const missing = required.filter((key) => !cfg[key]);
  if (missing.length) {
    return `Missing required config: ${missing.join(', ')}`;
  }

  return null;
}

/**
 * Validate config for Agentic Token Exchange flow.
 * Returns an error message string or null if valid.
 */
export function validateAgenticConfig(cfg) {
  // Validate basic OAuth fields
  const required = ['oktaDomain', 'clientId', 'redirectUri'];
  let missing = required.filter((key) => !cfg[key]);
  if (missing.length) {
    return `Missing required config: ${missing.join(', ')}`;
  }

  // Additional required fields for Agentic flow
  const agenticRequired = [
    'principalId',
    'privateJwk',
  ];

  missing = agenticRequired.filter((key) => !cfg[key]);
  if (missing.length) {
    return `Missing required config: ${missing.join(', ')}`;
  }

  if (typeof cfg.privateJwk === 'string') {
    try {
      cfg.privateJwk = JSON.parse(cfg.privateJwk);
    } catch {
      return 'privateJwk must be valid JSON';
    }
  }

  return null;
}
