/**
 * Vercel Serverless API Handler - Sub Functions
 * Handles utility functions like JWT creation, token exchange, HTTP requests
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // List available sub functions
      res.json({
        subFunctions: [
          {
            id: 'createJwtAssertion',
            name: 'Create JWT Assertion',
            description: 'Create a signed JWT assertion for OAuth flows',
          },
          {
            id: 'decodeJwt',
            name: 'Decode JWT',
            description: 'Decode and inspect JWT tokens',
          },
          {
            id: 'httpRequest',
            name: 'HTTP Request',
            description: 'Make HTTP requests to Okta or other endpoints',
          },
          {
            id: 'tokenExchange',
            name: 'Token Exchange',
            description: 'Perform RFC 8693 token exchange',
          },
          {
            id: 'jwtBearerGrant',
            name: 'JWT Bearer Grant',
            description: 'Execute JWT Bearer Grant flow',
          },
        ],
      });
    } else if (req.method === 'POST') {
      // Execute a sub function
      const { functionId, parameters } = req.body;

      if (!functionId) {
        return res.status(400).json({ error: 'functionId is required' });
      }

      // Route to specific sub function handlers
      switch (functionId) {
        case 'createJwtAssertion':
          return handleCreateJwtAssertion(req, res);
        case 'decodeJwt':
          return handleDecodeJwt(req, res);
        case 'httpRequest':
          return handleHttpRequest(req, res);
        case 'tokenExchange':
          return handleTokenExchange(req, res);
        case 'jwtBearerGrant':
          return handleJwtBearerGrant(req, res);
        default:
          return res.status(400).json({ error: 'Unknown function' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleCreateJwtAssertion(req, res) {
  try {
    const { payload, privateKey, algorithm } = req.body;
    
    if (!payload || !privateKey) {
      return res.status(400).json({ error: 'payload and privateKey required' });
    }

    // JWT creation would be implemented here using jose library
    res.json({
      functionId: 'createJwtAssertion',
      status: 'pending',
      message: 'JWT assertion creation handler - implement with jose library',
      payload,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleDecodeJwt(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    // JWT decoding would be implemented here
    res.json({
      functionId: 'decodeJwt',
      status: 'pending',
      message: 'JWT decode handler - implement with jose library',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleHttpRequest(req, res) {
  try {
    const { url, method, headers, body } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // HTTP request would be implemented here using fetch or axios
    res.json({
      functionId: 'httpRequest',
      status: 'pending',
      message: 'HTTP request handler - implement actual request',
      url,
      method: method || 'GET',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleTokenExchange(req, res) {
  try {
    const { subjectToken, subjectTokenType, resourceServers } = req.body;
    
    if (!subjectToken) {
      return res.status(400).json({ error: 'subjectToken is required' });
    }

    res.json({
      functionId: 'tokenExchange',
      status: 'pending',
      message: 'Token exchange handler - implement RFC 8693 flow',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleJwtBearerGrant(req, res) {
  try {
    const { assertion, tokenUrl } = req.body;
    
    if (!assertion || !tokenUrl) {
      return res.status(400).json({ error: 'assertion and tokenUrl required' });
    }

    res.json({
      functionId: 'jwtBearerGrant',
      status: 'pending',
      message: 'JWT Bearer Grant handler - implement OAuth flow',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
