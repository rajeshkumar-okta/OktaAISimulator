/**
 * Next.js API Route - OAuth Token Exchange
 * POST /api/oauth/token
 * 
 * Exchanges authorization code for tokens
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, oktaDomain, clientId, clientSecret, redirectUri, authorizationServerId, codeVerifier } = req.body;

    console.log('[Token Exchange] Request received:', { 
      code: code ? 'present' : 'MISSING',
      state,
      oktaDomain,
      clientId,
      clientSecret: clientSecret ? 'present' : 'MISSING',
      redirectUri,
      authorizationServerId,
      codeVerifier: codeVerifier ? 'present' : 'MISSING',
    });

    if (!code || !oktaDomain || !clientId) {
      return res.status(400).json({ 
        error: 'code, oktaDomain, and clientId required',
        received: { 
          code: code ? 'present' : 'MISSING',
          oktaDomain: oktaDomain ? 'present' : 'MISSING',
          clientId: clientId ? 'present' : 'MISSING',
        }
      });
    }

    if (!redirectUri) {
      return res.status(400).json({ 
        error: 'redirectUri is required',
        received: { redirectUri }
      });
    }

    // Clean up oktaDomain
    let cleanDomain = oktaDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    // Determine OAuth path
    const oauthPath = authorizationServerId && authorizationServerId !== '(org)' 
      ? `oauth2/${authorizationServerId}/v1`
      : 'oauth2/v1';

    // Build token request
    const tokenUrl = `https://${cleanDomain}/${oauthPath}/token`;
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      ...(clientSecret && { client_secret: clientSecret }),
      ...(codeVerifier && { code_verifier: codeVerifier }),
    });

    console.log('[Token Exchange] Requesting tokens from:', tokenUrl);

    // Exchange code for tokens
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('[Token Exchange] Error response:', errorText);
      return res.status(tokenResponse.status).json({ 
        error: `Token exchange failed: ${tokenResponse.statusText}`,
        details: errorText,
      });
    }

    const tokens = await tokenResponse.json();

    console.log('[Token Exchange] Success! Got tokens');

    // Decode and return tokens
    res.json({
      success: true,
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (error) {
    console.log('[Token Exchange] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
