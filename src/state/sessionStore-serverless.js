/**
 * Serverless-compatible session store for Vercel
 * Uses environment-based storage for distributed serverless functions
 */

// In-memory cache for current request cycle
let memoryStore = {
  // OAuth state
  oauthState: null,
  oauthNonce: null,
  codeVerifier: null,
  cfg: null,

  // Step 1 result
  idToken: null,
  accessToken: null,
  refreshToken: null,
  idTokenClaims: null,

  // Step 2 result
  idJagToken: null,
  idJagResult: null,

  // Step 3 result
  idJagVerification: null,

  // Step 4 result
  authServerToken: null,
  authServerResult: null,

  // Step 5 result
  authServerVerification: null,
};

/**
 * Get current state
 */
export function getState() {
  return memoryStore;
}

/**
 * Set entire state
 */
export function setState(newState) {
  memoryStore = { ...memoryStore, ...newState };
  return memoryStore;
}

/**
 * Update a single property
 */
export function updateState(key, value) {
  memoryStore[key] = value;
  return memoryStore;
}

/**
 * Reset state
 */
export function resetState() {
  memoryStore = {
    oauthState: null,
    oauthNonce: null,
    codeVerifier: null,
    cfg: null,
    idToken: null,
    accessToken: null,
    refreshToken: null,
    idTokenClaims: null,
    idJagToken: null,
    idJagResult: null,
    idJagVerification: null,
    authServerToken: null,
    authServerResult: null,
    authServerVerification: null,
  };
  return memoryStore;
}

/**
 * Store state in environment variable (for cross-request persistence)
 * Note: This is a workaround for serverless - consider using a database
 */
export function serializeState() {
  return Buffer.from(JSON.stringify(memoryStore)).toString('base64');
}

/**
 * Restore state from serialized format
 */
export function deserializeState(serialized) {
  try {
    const decoded = Buffer.from(serialized, 'base64').toString('utf-8');
    const state = JSON.parse(decoded);
    memoryStore = { ...memoryStore, ...state };
    return memoryStore;
  } catch {
    return memoryStore;
  }
}
