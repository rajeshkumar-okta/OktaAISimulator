import { SignJWT, importJWK } from 'jose';
import crypto from 'crypto';

/**
 * Determine the signing algorithm from a JWK.
 */
function getAlgorithm(jwk) {
  if (jwk.alg) return jwk.alg;

  switch (jwk.kty) {
    case 'RSA':
      return 'RS256';
    case 'EC':
      if (jwk.crv === 'P-384') return 'ES384';
      if (jwk.crv === 'P-521') return 'ES512';
      return 'ES256';
    case 'OKP':
      return 'EdDSA';
    default:
      return 'RS256';
  }
}

/**
 * Import the private JWK and validate it contains private key material.
 */
async function getPrivateKey(jwk) {
  if (!jwk.d) {
    throw new Error(
      '[Local App] The provided JWK is a public key. A private key (containing the "d" field) is required for signing.'
    );
  }

  const alg = getAlgorithm(jwk);
  try {
    return { privateKey: await importJWK(jwk, alg), alg };
  } catch (err) {
    throw new Error(`[Local App] Failed to import private key: ${err.message}`);
  }
}

/**
 * Create a JWT client assertion for token endpoint authentication.
 * Used in Steps 1 and 3 for client_assertion auth.
 */
export async function createClientAssertion(cfg, audience) {
  const { privateKey, alg } = await getPrivateKey(cfg.privateJwk);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg, kid: cfg.privateJwk.kid })
    .setIssuer(cfg.clientId)
    .setSubject(cfg.clientId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  return jwt;
}

/**
 * Create a JWT client assertion for agentic token exchange.
 * Uses principalId (Agent/Workload ID) as issuer and subject.
 */
export async function createAgenticClientAssertion(cfg, audience) {
  const { privateKey, alg } = await getPrivateKey(cfg.privateJwk);

  if (!cfg.principalId) {
    throw new Error('[Local App] Principal ID (Agent/Workload ID) is required for agentic token exchange.');
  }

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg, kid: cfg.privateJwk.kid })
    .setIssuer(cfg.principalId)
    .setSubject(cfg.principalId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('1m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  return jwt;
}

