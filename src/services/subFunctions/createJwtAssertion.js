/**
 * Sub Function: Create JWT Client Assertion
 *
 * Creates a signed JWT for client authentication per RFC 7523.
 * This is used when your OAuth client is configured for "private_key_jwt"
 * authentication instead of using a client secret.
 *
 * SPECIFICATION: RFC 7523 - JWT Profile for OAuth 2.0 Client Authentication
 * https://www.rfc-editor.org/rfc/rfc7523
 */

import { SignJWT, importJWK } from 'jose';
import crypto from 'crypto';

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

export default {
  id: 'createJwtAssertion',
  name: 'Create JWT Client Assertion',
  category: 'jwt',

  // ---------------------------------------------------------------------------
  // EDUCATIONAL DESCRIPTION
  // ---------------------------------------------------------------------------
  // This description is shown in the UI to help learners understand
  // what this function does and when to use it.
  description: `Creates a signed JWT for client authentication per RFC 7523.

WHAT IT DOES:
Signs a JWT using your private key. This JWT proves your application's
identity to the authorization server, similar to how a client secret works
but with stronger cryptographic security.

WHEN TO USE:
When your OAuth client is configured for "private_key_jwt" authentication
instead of a client secret. This is common in:
- Machine-to-machine (M2M) applications
- Agentic/workload identity flows
- High-security enterprise integrations

HOW IT WORKS:
1. Takes your private JWK (JSON Web Key)
2. Creates JWT claims: issuer, subject, audience, expiration
3. Signs the JWT using RS256, ES256, or EdDSA algorithm
4. Returns the signed JWT string

The resulting JWT can be used as the "client_assertion" parameter
in token requests with "client_assertion_type" set to:
"urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

SPECIFICATION: RFC 7523 - JWT Profile for OAuth 2.0 Client
Authentication and Authorization Grants`,

  // ---------------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------------
  // Each input has a type, required flag, description, and example.
  inputs: {
    privateJwk: {
      type: 'jwk',
      required: true,
      description: 'Your private key in JWK format. Must contain the "d" field (private key material). Supported key types: RSA, EC (P-256, P-384), and OKP (Ed25519).',
      example: '{"kty":"RSA","kid":"my-key","d":"...","n":"...","e":"AQAB"}'
    },
    issuer: {
      type: 'string',
      required: true,
      description: 'The "iss" claim - identifies who created this JWT. Usually your Client ID or Principal ID.',
      example: '0oa1234567890abcdef'
    },
    subject: {
      type: 'string',
      required: true,
      description: 'The "sub" claim - identifies the subject of the JWT. Usually the same as issuer for client authentication.',
      example: '0oa1234567890abcdef'
    },
    audience: {
      type: 'string',
      required: true,
      description: 'The "aud" claim - the token endpoint URL you are authenticating to. Must match exactly what the authorization server expects.',
      example: 'https://dev-12345.okta.com/oauth2/default/v1/token'
    },
    expiresIn: {
      type: 'string',
      required: false,
      default: '5m',
      description: 'How long until the JWT expires. Short-lived for security. Format: "5m" for 5 minutes, "1h" for 1 hour.',
      example: '5m'
    }
  },

  // ---------------------------------------------------------------------------
  // OUTPUTS
  // ---------------------------------------------------------------------------
  // What this function returns.
  outputs: {
    assertion: {
      type: 'string',
      description: 'The signed JWT string. Use this as the "client_assertion" parameter in token requests.'
    },
    algorithm: {
      type: 'string',
      description: 'The signing algorithm used (RS256, ES256, ES384, or EdDSA).'
    },
    kid: {
      type: 'string',
      description: 'The key ID from the JWK, if present. Helps the server identify which key to use for verification.'
    },
    expiresAt: {
      type: 'number',
      description: 'Unix timestamp when this JWT expires. After this time, the JWT will be rejected.'
    }
  },

  // ---------------------------------------------------------------------------
  // EXECUTE FUNCTION
  // ---------------------------------------------------------------------------
  // The actual implementation with detailed educational comments.
  async execute(inputs, context) {
    // ========================================================================
    // STEP 1: Parse the Private JWK
    // ========================================================================
    // The JWK (JSON Web Key) contains your private key material.
    // It must have a "d" field - this is the private part that allows signing.
    // Without "d", it's just a public key and cannot create signatures.
    //
    // JWK format is defined in RFC 7517: https://www.rfc-editor.org/rfc/rfc7517

    let jwk;
    try {
      jwk = typeof inputs.privateJwk === 'string'
        ? JSON.parse(inputs.privateJwk)
        : inputs.privateJwk;
    } catch (err) {
      throw new Error(
        'Invalid JWK: Could not parse as JSON. ' +
        'Ensure your private key is in valid JWK format.'
      );
    }

    // Verify this is a private key (has "d" field)
    if (!jwk.d) {
      throw new Error(
        'Private key required: JWK must contain "d" field. ' +
        'The "d" field contains the private key material needed for signing. ' +
        'Public keys (without "d") can only verify signatures, not create them.'
      );
    }

    // ========================================================================
    // STEP 2: Determine the Signing Algorithm
    // ========================================================================
    // The algorithm is chosen based on the key type (kty):
    //
    // - RSA keys (kty: "RSA") → RS256 (RSA with SHA-256)
    //   Most common, widely supported, larger keys (2048+ bits)
    //
    // - EC P-256 keys (kty: "EC", crv: "P-256") → ES256 (ECDSA with SHA-256)
    //   Smaller keys, faster operations, good security
    //
    // - EC P-384 keys (kty: "EC", crv: "P-384") → ES384 (ECDSA with SHA-384)
    //   Higher security level than P-256
    //
    // - OKP Ed25519 keys (kty: "OKP", crv: "Ed25519") → EdDSA
    //   Modern, fast, recommended for new applications

    let algorithm;
    switch (jwk.kty) {
      case 'RSA':
        algorithm = 'RS256';
        break;
      case 'EC':
        if (jwk.crv === 'P-256') {
          algorithm = 'ES256';
        } else if (jwk.crv === 'P-384') {
          algorithm = 'ES384';
        } else {
          throw new Error(`Unsupported EC curve: ${jwk.crv}. Supported: P-256, P-384`);
        }
        break;
      case 'OKP':
        if (jwk.crv === 'Ed25519') {
          algorithm = 'EdDSA';
        } else {
          throw new Error(`Unsupported OKP curve: ${jwk.crv}. Supported: Ed25519`);
        }
        break;
      default:
        throw new Error(`Unsupported key type: ${jwk.kty}. Supported: RSA, EC, OKP`);
    }

    // ========================================================================
    // STEP 3: Import the Key for Signing
    // ========================================================================
    // Convert the JWK into a format the crypto library can use.
    // This step validates the key structure and prepares it for signing.
    // The jose library handles the complexity of different key types.

    let privateKey;
    try {
      privateKey = await importJWK(jwk, algorithm);
    } catch (err) {
      throw new Error(
        `Failed to import key: ${err.message}. ` +
        'Check that your JWK has all required fields for the key type.'
      );
    }

    // ========================================================================
    // STEP 4: Calculate Expiration Time
    // ========================================================================
    // JWTs should be short-lived for security. Parse the expiresIn parameter.
    // Format examples: "5m" (5 minutes), "1h" (1 hour), "30s" (30 seconds)

    const expiresIn = inputs.expiresIn || '5m';
    const now = Math.floor(Date.now() / 1000);

    // Calculate expiration timestamp
    let expiresAt;
    const match = expiresIn.match(/^(\d+)([smh])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const multipliers = { s: 1, m: 60, h: 3600 };
      expiresAt = now + (value * multipliers[unit]);
    } else {
      // Default to 5 minutes if format not recognized
      expiresAt = now + 300;
    }

    // ========================================================================
    // STEP 5: Build and Sign the JWT
    // ========================================================================
    // The JWT has three parts: header.payload.signature
    //
    // HEADER (encoded as base64url):
    // {
    //   "alg": "RS256",           ← Signing algorithm
    //   "kid": "my-key-id"        ← Key ID for verification lookup
    // }
    //
    // PAYLOAD (encoded as base64url):
    // {
    //   "iss": "your-client-id",       ← Who created this JWT (issuer)
    //   "sub": "your-client-id",       ← Who this JWT is about (subject)
    //   "aud": "https://token-endpoint", ← Who should accept it (audience)
    //   "iat": 1234567890,              ← When it was created (issued at)
    //   "exp": 1234568190,              ← When it expires (expiration)
    //   "jti": "unique-id-12345"        ← Unique ID prevents replay attacks
    // }
    //
    // SIGNATURE:
    // Created by signing header + "." + payload with the private key

    const jti = crypto.randomUUID();

    const jwt = await new SignJWT({})
      .setProtectedHeader({
        alg: algorithm,
        kid: jwk.kid  // Include key ID if present
      })
      .setIssuer(inputs.issuer)
      .setSubject(inputs.subject)
      .setAudience(inputs.audience)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .setJti(jti)  // JWT ID - unique identifier prevents replay attacks
      .sign(privateKey);

    // ========================================================================
    // STEP 6: Return the Signed JWT
    // ========================================================================
    // This JWT string can now be used as the "client_assertion" parameter
    // in OAuth token requests. The authorization server will:
    // 1. Decode the JWT
    // 2. Verify the signature using your public key (from JWKS endpoint)
    // 3. Check that iss/sub match your client ID
    // 4. Check that aud matches the token endpoint
    // 5. Check that the JWT hasn't expired

    return {
      outputs: {
        assertion: jwt,
        algorithm,
        kid: jwk.kid || null,
        expiresAt
      }
    };
  }
};
