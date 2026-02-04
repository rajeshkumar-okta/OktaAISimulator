/**
 * Sub Function: JWT Bearer Grant
 *
 * Uses a JWT assertion as an authorization grant to obtain tokens.
 * This is different from client authentication - here the JWT IS the grant,
 * representing authorization to act on behalf of a subject.
 *
 * SPECIFICATION: RFC 7523 - JWT Profile for OAuth 2.0 Authorization Grants
 * https://www.rfc-editor.org/rfc/rfc7523
 */

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

export default {
  id: 'jwtBearerGrant',
  name: 'JWT Bearer Grant',
  category: 'oauth',

  // ---------------------------------------------------------------------------
  // EDUCATIONAL DESCRIPTION
  // ---------------------------------------------------------------------------
  description: `Uses a JWT assertion as an authorization grant per RFC 7523.

WHAT IT DOES:
Uses a signed JWT as proof of authorization to obtain an access token.
The JWT represents permission to act on behalf of the subject specified
in the JWT's claims.

WHEN TO USE:
- Server-to-server authentication where the JWT represents prior authorization
- Agentic workflows where an ID-JAG grants permission to act
- Cross-domain authorization where a trusted issuer provides the JWT

HOW IT DIFFERS FROM CLIENT ASSERTION:
- Client Assertion: JWT proves CLIENT identity (authentication)
- JWT Bearer Grant: JWT proves AUTHORIZATION (the grant itself)

Both can be used together - client assertion for auth, JWT bearer for the grant.

HOW IT WORKS:
1. You have a JWT (like an ID-JAG) that represents authorization
2. Send a POST to the token endpoint with grant_type=jwt-bearer
3. Include the JWT as the "assertion" parameter
4. Optionally authenticate the client with a separate assertion
5. Receive an access token for the scope/audience requested

SPECIFICATION: RFC 7523 - JWT Profile for OAuth 2.0 Authorization Grants`,

  // ---------------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------------
  inputs: {
    tokenEndpoint: {
      type: 'string',
      required: true,
      description: 'The OAuth token endpoint URL.',
      example: 'https://dev-12345.okta.com/oauth2/default/v1/token'
    },
    assertion: {
      type: 'string',
      required: true,
      description: 'The JWT to use as the authorization grant. This JWT represents permission to act.',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    scope: {
      type: 'string',
      required: false,
      description: 'Requested scopes for the access token, space-separated.',
      example: 'openid profile email'
    },
    clientAssertion: {
      type: 'string',
      required: false,
      description: 'Separate JWT for client authentication (not the grant). Use this for private_key_jwt client auth.',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    clientId: {
      type: 'string',
      required: false,
      description: 'Client ID. Required if not using client_assertion.',
      example: '0oa1234567890abcdef'
    },
    clientSecret: {
      type: 'string',
      required: false,
      description: 'Client secret for Basic Auth (if not using assertion).',
      example: 'your-client-secret'
    }
  },

  // ---------------------------------------------------------------------------
  // OUTPUTS
  // ---------------------------------------------------------------------------
  outputs: {
    access_token: {
      type: 'string',
      description: 'The access token obtained from the grant.'
    },
    token_type: {
      type: 'string',
      description: 'The token type (usually "Bearer").'
    },
    expires_in: {
      type: 'number',
      description: 'Seconds until the access token expires.'
    },
    scope: {
      type: 'string',
      description: 'The scopes granted to the access token.'
    },
    id_token: {
      type: 'string',
      description: 'ID token (if openid scope was requested).'
    },
    curl: {
      type: 'string',
      description: 'The cURL command that was executed (for learning/debugging).'
    }
  },

  // ---------------------------------------------------------------------------
  // EXECUTE FUNCTION
  // ---------------------------------------------------------------------------
  async execute(inputs, context) {
    // ========================================================================
    // STEP 1: Build the Request Body
    // ========================================================================
    // The JWT Bearer Grant uses:
    // - grant_type: urn:ietf:params:oauth:grant-type:jwt-bearer
    // - assertion: The JWT that serves as the authorization grant
    // - scope: Optional requested scopes
    //
    // This is different from token exchange where you're converting one token
    // to another. Here, the JWT IS the grant - it represents authorization.

    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', inputs.assertion);

    // Add optional scope
    if (inputs.scope) {
      params.append('scope', inputs.scope);
    }

    // ========================================================================
    // STEP 2: Set Up Client Authentication
    // ========================================================================
    // Even though the JWT is the grant, we still need to authenticate
    // the CLIENT making the request. This can be done via:
    //
    // A) Separate Client Assertion (private_key_jwt):
    //    A different JWT that proves the client's identity
    //
    // B) Client Secret (Basic Auth):
    //    Traditional client_id + client_secret
    //
    // Note: The assertion parameter IS NOT for client auth - it's the grant!

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };

    let authDescription = '';

    if (inputs.clientAssertion) {
      // Client authentication via separate JWT assertion
      // This proves WHO is making the request (the client)
      // The grant assertion proves WHAT is authorized (the permission)
      params.append('client_assertion', inputs.clientAssertion);
      params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      authDescription = 'Client Auth: JWT Assertion';
    } else if (inputs.clientId && inputs.clientSecret) {
      // Client authentication via Basic Auth
      const credentials = Buffer.from(`${inputs.clientId}:${inputs.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      authDescription = 'Client Auth: Basic (client_id:secret)';
    } else if (inputs.clientId) {
      // Just client_id (for public clients or when assertion includes it)
      params.append('client_id', inputs.clientId);
      authDescription = 'Client Auth: Public Client';
    }

    // ========================================================================
    // STEP 3: Generate cURL Command
    // ========================================================================
    // For educational purposes, show the equivalent cURL command.
    // This helps learners understand the OAuth protocol.

    const curlParts = ['curl -X POST'];
    curlParts.push(`'${inputs.tokenEndpoint}'`);

    // Add headers
    for (const [key, value] of Object.entries(headers)) {
      if (key === 'Authorization') {
        curlParts.push(`-H 'Authorization: Basic ***'`);
      } else {
        curlParts.push(`-H '${key}: ${value}'`);
      }
    }

    // Build masked params for cURL
    const curlParams = new URLSearchParams(params);
    // Mask the assertions for security
    if (curlParams.has('assertion')) {
      const token = curlParams.get('assertion');
      curlParams.set('assertion', token.substring(0, 20) + '...[JWT]');
    }
    if (curlParams.has('client_assertion')) {
      const token = curlParams.get('client_assertion');
      curlParams.set('client_assertion', token.substring(0, 20) + '...[JWT]');
    }
    curlParts.push(`-d '${curlParams.toString()}'`);

    const curl = curlParts.join(' \\\n  ');

    // ========================================================================
    // STEP 4: Make the Token Request
    // ========================================================================
    // Send the request to the token endpoint.
    // The authorization server will:
    // 1. Authenticate the client (via assertion or secret)
    // 2. Validate the JWT grant (assertion parameter)
    // 3. Check the JWT's claims (iss, sub, aud, exp)
    // 4. Verify the JWT signature
    // 5. Issue an access token if all checks pass

    const response = await fetch(inputs.tokenEndpoint, {
      method: 'POST',
      headers,
      body: params.toString()
    });

    // ========================================================================
    // STEP 5: Parse the Response
    // ========================================================================
    // Success (200 OK):
    // {
    //   "access_token": "eyJhbGci...",
    //   "token_type": "Bearer",
    //   "expires_in": 3600,
    //   "scope": "openid profile",
    //   "id_token": "eyJhbGci..."  // if openid scope
    // }
    //
    // Error (400/401):
    // {
    //   "error": "invalid_grant",
    //   "error_description": "The assertion has expired"
    // }

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMsg = responseBody.error_description || responseBody.error || 'JWT Bearer Grant failed';
      throw new Error(`JWT Bearer Grant Error: ${errorMsg}`);
    }

    // ========================================================================
    // STEP 6: Return the Result
    // ========================================================================

    return {
      outputs: {
        access_token: responseBody.access_token,
        token_type: responseBody.token_type,
        expires_in: responseBody.expires_in,
        scope: responseBody.scope,
        id_token: responseBody.id_token,
        refresh_token: responseBody.refresh_token
      },
      curl
    };
  }
};
