/**
 * Sub Function: Decode JWT
 *
 * Decodes a JWT to inspect its header and payload without validation.
 * This is useful for debugging, learning, and inspecting token contents.
 *
 * IMPORTANT: This does NOT validate the signature! Use this for inspection only.
 *
 * SPECIFICATION: RFC 7519 - JSON Web Token (JWT)
 * https://www.rfc-editor.org/rfc/rfc7519
 */

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

export default {
  id: 'decodeJwt',
  name: 'Decode JWT',
  category: 'jwt',

  // ---------------------------------------------------------------------------
  // EDUCATIONAL DESCRIPTION
  // ---------------------------------------------------------------------------
  description: `Decodes a JWT to inspect its contents without validation.

WHAT IT DOES:
Splits a JWT into its three parts (header, payload, signature) and
decodes the base64url-encoded header and payload to reveal the claims.

IMPORTANT SECURITY NOTE:
This function does NOT validate the signature! Anyone can create a JWT
with any claims - the signature is what proves authenticity. Use this
function only for inspection and debugging, not for access control.

JWT STRUCTURE:
A JWT has three parts separated by dots: header.payload.signature

HEADER (decoded):
{
  "alg": "RS256",    // Signing algorithm
  "kid": "key-id",   // Key ID for signature verification
  "typ": "JWT"       // Token type
}

PAYLOAD (decoded):
{
  "iss": "issuer",        // Who created the token
  "sub": "subject",       // Who the token is about
  "aud": "audience",      // Intended recipient
  "exp": 1234567890,      // Expiration time (Unix timestamp)
  "iat": 1234567800,      // Issued at time
  "nbf": 1234567800,      // Not valid before
  ... custom claims ...
}

SIGNATURE:
Base64url-encoded cryptographic signature (not decoded by this function)

WHEN TO USE:
- Debugging token issues
- Learning about JWT structure
- Inspecting claims before using a token
- Understanding what's in an access token or ID token

SPECIFICATION: RFC 7519 - JSON Web Token (JWT)`,

  // ---------------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------------
  inputs: {
    token: {
      type: 'string',
      required: true,
      description: 'The JWT string to decode. Must be a valid JWT format (three base64url-encoded parts separated by dots).',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'
    },
    checkExpiration: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'If true, check if the token is expired and include isExpired in output.',
      example: true
    }
  },

  // ---------------------------------------------------------------------------
  // OUTPUTS
  // ---------------------------------------------------------------------------
  outputs: {
    header: {
      type: 'object',
      description: 'The decoded JWT header containing algorithm and key information.'
    },
    payload: {
      type: 'object',
      description: 'The decoded JWT payload containing all claims.'
    },
    signature: {
      type: 'string',
      description: 'The raw base64url-encoded signature (not decoded).'
    },
    isExpired: {
      type: 'boolean',
      description: 'Whether the token has expired based on the "exp" claim.'
    },
    expiresAt: {
      type: 'string',
      description: 'Human-readable expiration time (if exp claim exists).'
    },
    issuedAt: {
      type: 'string',
      description: 'Human-readable issue time (if iat claim exists).'
    },
    issuer: {
      type: 'string',
      description: 'The "iss" claim - who issued the token.'
    },
    subject: {
      type: 'string',
      description: 'The "sub" claim - who the token is about.'
    },
    audience: {
      type: 'string',
      description: 'The "aud" claim - intended recipient.'
    }
  },

  // ---------------------------------------------------------------------------
  // EXECUTE FUNCTION
  // ---------------------------------------------------------------------------
  async execute(inputs, context) {
    // ========================================================================
    // STEP 1: Split the JWT into Parts
    // ========================================================================
    // A JWT consists of three parts separated by dots:
    //   header.payload.signature
    //
    // Each part is base64url-encoded:
    // - base64url is like base64 but uses - instead of + and _ instead of /
    // - This makes JWTs safe to use in URLs

    const parts = inputs.token.split('.');

    if (parts.length !== 3) {
      throw new Error(
        `Invalid JWT format: Expected 3 parts separated by dots, got ${parts.length}. ` +
        'A valid JWT looks like: xxxxx.yyyyy.zzzzz'
      );
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // ========================================================================
    // STEP 2: Decode the Header
    // ========================================================================
    // The header contains metadata about the token:
    // - alg: The algorithm used to sign (RS256, ES256, etc.)
    // - kid: Key ID to identify which key signed this
    // - typ: Token type (usually "JWT")

    let header;
    try {
      // base64url to base64: replace - with + and _ with /
      const headerJson = Buffer.from(
        headerB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8');
      header = JSON.parse(headerJson);
    } catch (err) {
      throw new Error(
        `Failed to decode JWT header: ${err.message}. ` +
        'The header is not valid base64url-encoded JSON.'
      );
    }

    // ========================================================================
    // STEP 3: Decode the Payload
    // ========================================================================
    // The payload contains the claims - the actual data in the token.
    //
    // Standard claims (from RFC 7519):
    // - iss (issuer): Who created the token
    // - sub (subject): Who the token is about
    // - aud (audience): Who should accept the token
    // - exp (expiration): When the token expires (Unix timestamp)
    // - nbf (not before): When the token becomes valid
    // - iat (issued at): When the token was created
    // - jti (JWT ID): Unique identifier for the token
    //
    // Plus any custom claims the issuer added.

    let payload;
    try {
      const payloadJson = Buffer.from(
        payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8');
      payload = JSON.parse(payloadJson);
    } catch (err) {
      throw new Error(
        `Failed to decode JWT payload: ${err.message}. ` +
        'The payload is not valid base64url-encoded JSON.'
      );
    }

    // ========================================================================
    // STEP 4: Check Expiration
    // ========================================================================
    // The "exp" claim is a Unix timestamp (seconds since 1970-01-01).
    // Compare it to the current time to check if expired.
    //
    // Note: We're just checking, not validating! A clever attacker could
    // create a JWT with a future exp - the signature is what really matters.

    let isExpired = null;
    let expiresAt = null;

    if (payload.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      isExpired = now > payload.exp;
      expiresAt = new Date(payload.exp * 1000).toISOString();
    }

    // ========================================================================
    // STEP 5: Format Other Timestamps
    // ========================================================================
    // Convert Unix timestamps to human-readable format for convenience.

    let issuedAt = null;
    if (payload.iat !== undefined) {
      issuedAt = new Date(payload.iat * 1000).toISOString();
    }

    let notBefore = null;
    if (payload.nbf !== undefined) {
      notBefore = new Date(payload.nbf * 1000).toISOString();
    }

    // ========================================================================
    // STEP 6: Return the Decoded Token
    // ========================================================================
    // Return all the decoded information.
    // Remember: This is for inspection only - the signature is NOT validated!

    return {
      outputs: {
        header,
        payload,
        signature: signatureB64,

        // Expiration info
        isExpired,
        expiresAt,
        issuedAt,
        notBefore,

        // Convenience accessors for common claims
        issuer: payload.iss || null,
        subject: payload.sub || null,
        audience: payload.aud || null,
        algorithm: header.alg || null,
        keyId: header.kid || null,

        // Reminder that this is not validated
        _warning: 'This JWT was DECODED only, NOT VALIDATED. Do not trust the claims without signature verification.'
      }
    };
  }
};
