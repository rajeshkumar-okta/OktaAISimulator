/**
 * Sub Function: Token Exchange
 *
 * Exchanges one token for another per RFC 8693 OAuth 2.0 Token Exchange.
 * This enables scenarios like impersonation, delegation, and cross-domain
 * token conversion.
 *
 * SPECIFICATION: RFC 8693 - OAuth 2.0 Token Exchange
 * https://www.rfc-editor.org/rfc/rfc8693
 */

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

export default {
  id: 'tokenExchange',
  name: 'Token Exchange',
  category: 'oauth',

  // ---------------------------------------------------------------------------
  // EDUCATIONAL DESCRIPTION
  // ---------------------------------------------------------------------------
  description: `Exchanges one token for another per RFC 8693 Token Exchange.

WHAT IT DOES:
Takes a subject token (like an access token) and exchanges it for a different
token type. The new token can have different scopes, audiences, or types.

WHEN TO USE:
- Impersonation: Get a token to act on behalf of another user
- Delegation: Get a token for a downstream service
- Token type conversion: Exchange an access token for an ID-JAG
- Cross-domain: Exchange tokens between security domains

HOW IT WORKS:
1. Send a POST request to the token endpoint
2. Include the subject_token (the token to exchange)
3. Specify requested_token_type (what you want back)
4. Authenticate using client credentials or JWT assertion
5. Receive the new token in the response

COMMON TOKEN TYPES:
- urn:ietf:params:oauth:token-type:access_token
- urn:ietf:params:oauth:token-type:refresh_token
- urn:ietf:params:oauth:token-type:id_token
- urn:ietf:params:oauth:token-type:id-jag (Okta-specific)

SPECIFICATION: RFC 8693 - OAuth 2.0 Token Exchange`,

  // ---------------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------------
  inputs: {
    tokenEndpoint: {
      type: 'string',
      required: true,
      description: 'The OAuth token endpoint URL where the exchange request is sent.',
      example: 'https://dev-12345.okta.com/oauth2/v1/token'
    },
    subjectToken: {
      type: 'string',
      required: true,
      description: 'The token to exchange. This is the input token you want to trade for a different token.',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    subjectTokenType: {
      type: 'string',
      required: true,
      description: 'The type of the subject token. Common values: "access_token", "id_token", "refresh_token", or full URN.',
      example: 'access_token'
    },
    requestedTokenType: {
      type: 'string',
      required: true,
      description: 'The type of token you want to receive. Use full URN or shorthand.',
      example: 'urn:ietf:params:oauth:token-type:id-jag'
    },
    clientAssertion: {
      type: 'string',
      required: false,
      description: 'JWT client assertion for authentication. Use this OR clientId/clientSecret.',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    clientId: {
      type: 'string',
      required: false,
      description: 'Client ID for Basic Auth or client_credentials authentication.',
      example: '0oa1234567890abcdef'
    },
    clientSecret: {
      type: 'string',
      required: false,
      description: 'Client secret for Basic Auth authentication.',
      example: 'your-client-secret'
    },
    scope: {
      type: 'string',
      required: false,
      description: 'Requested scopes for the new token, space-separated.',
      example: 'openid profile'
    },
    audience: {
      type: 'string',
      required: false,
      description: 'The intended audience for the new token.',
      example: 'api://my-api'
    },
    actorToken: {
      type: 'string',
      required: false,
      description: 'Token representing the actor (for delegation scenarios).',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    actorTokenType: {
      type: 'string',
      required: false,
      description: 'Type of the actor token.',
      example: 'access_token'
    }
  },

  // ---------------------------------------------------------------------------
  // OUTPUTS
  // ---------------------------------------------------------------------------
  outputs: {
    access_token: {
      type: 'string',
      description: 'The new access token received from the exchange.'
    },
    token_type: {
      type: 'string',
      description: 'The token type (usually "Bearer").'
    },
    expires_in: {
      type: 'number',
      description: 'Seconds until the new token expires.'
    },
    issued_token_type: {
      type: 'string',
      description: 'The actual type of token that was issued.'
    },
    scope: {
      type: 'string',
      description: 'The scopes granted to the new token.'
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
    // STEP 1: Normalize Token Types
    // ========================================================================
    // Token types can be specified as shorthand or full URN.
    // We convert shorthand to full URN for the request.
    //
    // Shorthand → Full URN mapping:
    // - access_token → urn:ietf:params:oauth:token-type:access_token
    // - id_token → urn:ietf:params:oauth:token-type:id_token
    // - refresh_token → urn:ietf:params:oauth:token-type:refresh_token

    const tokenTypeMap = {
      'access_token': 'urn:ietf:params:oauth:token-type:access_token',
      'id_token': 'urn:ietf:params:oauth:token-type:id_token',
      'refresh_token': 'urn:ietf:params:oauth:token-type:refresh_token'
    };

    const subjectTokenType = tokenTypeMap[inputs.subjectTokenType] || inputs.subjectTokenType;
    const requestedTokenType = tokenTypeMap[inputs.requestedTokenType] || inputs.requestedTokenType;

    // ========================================================================
    // STEP 2: Build the Request Body
    // ========================================================================
    // The token exchange request uses grant_type "token-exchange" and includes:
    // - subject_token: The token to exchange
    // - subject_token_type: Type of the subject token (URN)
    // - requested_token_type: Type of token you want back (URN)
    // - Optional: scope, audience, actor_token, actor_token_type

    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
    params.append('subject_token', inputs.subjectToken);
    params.append('subject_token_type', subjectTokenType);
    params.append('requested_token_type', requestedTokenType);

    // Add optional parameters if provided
    if (inputs.scope) {
      params.append('scope', inputs.scope);
    }
    if (inputs.audience) {
      params.append('audience', inputs.audience);
    }
    if (inputs.actorToken) {
      params.append('actor_token', inputs.actorToken);
      params.append('actor_token_type', tokenTypeMap[inputs.actorTokenType] || inputs.actorTokenType);
    }

    // ========================================================================
    // STEP 3: Set Up Authentication
    // ========================================================================
    // There are two main authentication methods:
    //
    // A) JWT Client Assertion (private_key_jwt):
    //    - More secure, uses public key cryptography
    //    - Requires client_assertion and client_assertion_type parameters
    //
    // B) Client Secret (Basic Auth or POST):
    //    - Simpler, uses shared secret
    //    - Can be sent as Authorization header or body parameters

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };

    let authDescription = '';

    if (inputs.clientAssertion) {
      // Method A: JWT Client Assertion
      // The assertion proves the client's identity using a signed JWT
      params.append('client_assertion', inputs.clientAssertion);
      params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      authDescription = 'JWT Client Assertion (private_key_jwt)';
    } else if (inputs.clientId && inputs.clientSecret) {
      // Method B: Client Secret using Basic Auth header
      // Base64 encode "clientId:clientSecret" for the Authorization header
      const credentials = Buffer.from(`${inputs.clientId}:${inputs.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      authDescription = 'Client Secret (Basic Auth)';
    } else if (inputs.clientId) {
      // Public client - just include client_id in body
      params.append('client_id', inputs.clientId);
      authDescription = 'Public Client (no secret)';
    }

    // ========================================================================
    // STEP 4: Generate cURL Command
    // ========================================================================
    // For educational purposes, generate the equivalent cURL command.
    // This helps learners understand exactly what HTTP request is being made.

    const curlParts = ['curl -X POST'];
    curlParts.push(`'${inputs.tokenEndpoint}'`);

    // Add headers to cURL
    for (const [key, value] of Object.entries(headers)) {
      if (key === 'Authorization') {
        // Mask the credential in cURL for security
        curlParts.push(`-H 'Authorization: Basic ***'`);
      } else {
        curlParts.push(`-H '${key}: ${value}'`);
      }
    }

    // Add body (mask sensitive values)
    const curlParams = new URLSearchParams(params);
    // Mask tokens in the cURL output
    if (curlParams.has('subject_token')) {
      const token = curlParams.get('subject_token');
      curlParams.set('subject_token', token.substring(0, 20) + '...');
    }
    if (curlParams.has('client_assertion')) {
      const assertion = curlParams.get('client_assertion');
      curlParams.set('client_assertion', assertion.substring(0, 20) + '...');
    }
    curlParts.push(`-d '${curlParams.toString()}'`);

    const curl = curlParts.join(' \\\n  ');

    // ========================================================================
    // STEP 5: Make the Token Exchange Request
    // ========================================================================
    // Send the POST request to the token endpoint.
    // The server will:
    // 1. Validate the client authentication
    // 2. Validate the subject token
    // 3. Check if the exchange is allowed by policy
    // 4. Issue a new token with the requested type

    const response = await fetch(inputs.tokenEndpoint, {
      method: 'POST',
      headers,
      body: params.toString()
    });

    // ========================================================================
    // STEP 6: Parse the Response
    // ========================================================================
    // Successful response (200 OK):
    // {
    //   "access_token": "new-token-here",
    //   "issued_token_type": "urn:ietf:params:oauth:token-type:...",
    //   "token_type": "Bearer",
    //   "expires_in": 3600,
    //   "scope": "openid profile"
    // }
    //
    // Error response (400/401):
    // {
    //   "error": "invalid_grant",
    //   "error_description": "The subject token is expired"
    // }

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMsg = responseBody.error_description || responseBody.error || 'Token exchange failed';
      throw new Error(`Token Exchange Error: ${errorMsg}`);
    }

    // ========================================================================
    // STEP 7: Return the Result
    // ========================================================================
    // Return both the token response and the cURL command for learning.

    return {
      outputs: {
        access_token: responseBody.access_token,
        token_type: responseBody.token_type,
        expires_in: responseBody.expires_in,
        issued_token_type: responseBody.issued_token_type,
        scope: responseBody.scope,
        refresh_token: responseBody.refresh_token,
        id_token: responseBody.id_token
      },
      curl
    };
  }
};
