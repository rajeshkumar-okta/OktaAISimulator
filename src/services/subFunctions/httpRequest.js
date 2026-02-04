/**
 * Sub Function: HTTP Request
 *
 * Makes a generic HTTP request with full control over method, headers, and body.
 * Generates a cURL command for educational purposes.
 *
 * This is a flexible building block for calling any HTTP endpoint.
 */

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

export default {
  id: 'httpRequest',
  name: 'HTTP Request',
  category: 'http',

  // ---------------------------------------------------------------------------
  // EDUCATIONAL DESCRIPTION
  // ---------------------------------------------------------------------------
  description: `Makes a generic HTTP request with configurable method, headers, and body.

WHAT IT DOES:
Sends an HTTP request to any URL and returns the response. This is a flexible
building block for calling APIs, token endpoints, or any HTTP service.

WHEN TO USE:
- Calling a protected API with an access token
- Making custom OAuth requests not covered by other functions
- Testing API endpoints
- Any HTTP operation that needs cURL command generation

FEATURES:
- Supports all HTTP methods (GET, POST, PUT, DELETE, etc.)
- Custom headers (including Authorization)
- JSON or form-urlencoded body
- Automatic cURL command generation for learning
- Bearer token helper for common API calls

CURL GENERATION:
For every request, this function generates the equivalent cURL command.
This helps learners understand:
- How HTTP requests are structured
- How headers and authentication work
- How to reproduce the request manually`,

  // ---------------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------------
  inputs: {
    url: {
      type: 'string',
      required: true,
      description: 'The URL to send the request to.',
      example: 'https://api.example.com/users/me'
    },
    method: {
      type: 'string',
      required: false,
      default: 'GET',
      description: 'HTTP method: GET, POST, PUT, PATCH, DELETE, etc.',
      example: 'POST'
    },
    headers: {
      type: 'object',
      required: false,
      description: 'Custom headers as key-value pairs. Common headers: Authorization, Content-Type, Accept.',
      example: '{"Authorization": "Bearer xxx", "Accept": "application/json"}'
    },
    bearerToken: {
      type: 'string',
      required: false,
      description: 'Convenience: Bearer token to add as Authorization header. Equivalent to adding {"Authorization": "Bearer xxx"} to headers.',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
    },
    body: {
      type: 'object',
      required: false,
      description: 'Request body. Will be JSON-encoded unless contentType is form-urlencoded.',
      example: '{"name": "John", "email": "john@example.com"}'
    },
    contentType: {
      type: 'string',
      required: false,
      default: 'application/json',
      description: 'Content-Type for the body. Use "application/x-www-form-urlencoded" for form data.',
      example: 'application/json'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Request timeout in milliseconds.',
      example: 30000
    }
  },

  // ---------------------------------------------------------------------------
  // OUTPUTS
  // ---------------------------------------------------------------------------
  outputs: {
    status: {
      type: 'number',
      description: 'HTTP status code (200, 201, 400, 401, 404, 500, etc.).'
    },
    statusText: {
      type: 'string',
      description: 'HTTP status text (OK, Created, Bad Request, etc.).'
    },
    headers: {
      type: 'object',
      description: 'Response headers as key-value pairs.'
    },
    body: {
      type: 'any',
      description: 'Response body. Automatically parsed as JSON if Content-Type is application/json.'
    },
    ok: {
      type: 'boolean',
      description: 'True if status is 2xx, false otherwise.'
    },
    curl: {
      type: 'string',
      description: 'The equivalent cURL command for this request.'
    }
  },

  // ---------------------------------------------------------------------------
  // EXECUTE FUNCTION
  // ---------------------------------------------------------------------------
  async execute(inputs, context) {
    // ========================================================================
    // STEP 1: Build Headers
    // ========================================================================
    // Combine default headers with custom headers.
    // The bearerToken input is a convenience for the common Authorization: Bearer pattern.

    const headers = {
      'Accept': 'application/json',
      ...(inputs.headers || {})
    };

    // Add Bearer token if provided
    if (inputs.bearerToken) {
      headers['Authorization'] = `Bearer ${inputs.bearerToken}`;
    }

    // ========================================================================
    // STEP 2: Build Request Body
    // ========================================================================
    // The body is encoded based on contentType:
    // - application/json: JSON.stringify the body
    // - application/x-www-form-urlencoded: URLSearchParams encoding

    let body = null;
    const contentType = inputs.contentType || 'application/json';

    if (inputs.body !== undefined && inputs.body !== null) {
      headers['Content-Type'] = contentType;

      if (contentType === 'application/x-www-form-urlencoded') {
        // URL-encoded form data
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(inputs.body)) {
          params.append(key, String(value));
        }
        body = params.toString();
      } else {
        // JSON encoding (default)
        body = JSON.stringify(inputs.body);
      }
    }

    // ========================================================================
    // STEP 3: Generate cURL Command
    // ========================================================================
    // Build the equivalent cURL command for educational purposes.
    // This shows learners exactly what HTTP request is being made.

    const method = (inputs.method || 'GET').toUpperCase();
    const curlParts = [`curl -X ${method}`];
    curlParts.push(`'${inputs.url}'`);

    // Add headers to cURL (masking sensitive values)
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization') {
        // Mask the token in cURL output
        if (value.startsWith('Bearer ')) {
          const token = value.substring(7);
          curlParts.push(`-H 'Authorization: Bearer ${token.substring(0, 20)}...'`);
        } else {
          curlParts.push(`-H 'Authorization: ***'`);
        }
      } else {
        curlParts.push(`-H '${key}: ${value}'`);
      }
    }

    // Add body to cURL
    if (body) {
      // Escape single quotes in body for cURL
      const escapedBody = body.replace(/'/g, "'\\''");
      curlParts.push(`-d '${escapedBody}'`);
    }

    const curl = curlParts.join(' \\\n  ');

    // ========================================================================
    // STEP 4: Make the Request
    // ========================================================================
    // Use fetch to make the HTTP request.
    // Handle timeout with AbortController.

    const controller = new AbortController();
    const timeout = inputs.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response;
    try {
      response = await fetch(inputs.url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw new Error(`Request failed: ${err.message}`);
    }
    clearTimeout(timeoutId);

    // ========================================================================
    // STEP 5: Parse the Response
    // ========================================================================
    // Try to parse the response body as JSON if the Content-Type indicates JSON.
    // Otherwise, return as text.

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody;
    const responseContentType = response.headers.get('content-type') || '';

    if (responseContentType.includes('application/json')) {
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    // ========================================================================
    // STEP 6: Return the Result
    // ========================================================================

    return {
      outputs: {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody
      },
      curl
    };
  }
};
