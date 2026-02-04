// In-memory state for single-user demo (no sessions needed)
const store = {
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

export function getState() {
  return {
    step1: store.idToken ? { idTokenClaims: store.idTokenClaims, idToken: store.idToken, accessToken: store.accessToken, refreshToken: store.refreshToken } : null,
    step2: store.idJagResult ? { ...store.idJagResult, idJagToken: store.idJagToken } : null,
    step3: store.idJagVerification || null,
    step4: store.authServerResult ? { ...store.authServerResult, authServerToken: store.authServerToken } : null,
    step5: store.authServerVerification || null,
  };
}

export function set(key, value) {
  store[key] = value;
}

export function get(key) {
  return store[key];
}

export function reset() {
  Object.keys(store).forEach((key) => {
    store[key] = null;
  });
}
