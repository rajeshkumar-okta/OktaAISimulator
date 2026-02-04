import React, { useEffect } from 'react';

export default function Callback() {
  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract query parameters
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        console.log('[Callback] OAuth response:', { code: code ? 'present' : null, state, error });

        if (error) {
          throw new Error(`${error}: ${errorDescription || 'Unknown error'}`);
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        // Get state from session storage (was stored by parent when opening popup)
        const sessionState = sessionStorage.getItem('oauth-state');
        const sessionOktaDomain = sessionStorage.getItem('oauth-oktaDomain');
        const sessionClientId = sessionStorage.getItem('oauth-clientId');
        const sessionClientSecret = sessionStorage.getItem('oauth-clientSecret');
        const sessionRedirectUri = sessionStorage.getItem('oauth-redirectUri');
        const sessionAuthServerId = sessionStorage.getItem('oauth-authServerId');
        const sessionCodeVerifier = sessionStorage.getItem('oauth-codeVerifier');

        if (state !== sessionState) {
          console.warn('[Callback] State mismatch - possible CSRF attack');
        }

        // Exchange code for tokens
        console.log('[Callback] Exchanging code for tokens...');
        const tokenResponse = await fetch('/api/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            state,
            oktaDomain: sessionOktaDomain,
            clientId: sessionClientId,
            clientSecret: sessionClientSecret,
            redirectUri: sessionRedirectUri,
            authorizationServerId: sessionAuthServerId,
            codeVerifier: sessionCodeVerifier,
          }),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(errorData.error || `Token exchange failed with status ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();

        console.log('[Callback] Token exchange successful!');

        // Prepare message to send to parent window
        const message = {
          type: 'oauth-callback',
          success: true,
          code,
          state,
          idToken: tokenData.idToken,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresIn: tokenData.expiresIn,
          receivedAt: new Date().toISOString(),
        };

        // Try BroadcastChannel first (most reliable)
        try {
          const channel = new BroadcastChannel('oauth-callback');
          channel.postMessage(message);
          console.log('[Callback] Message sent via BroadcastChannel');
          channel.close();
        } catch (err) {
          console.log('[Callback] BroadcastChannel failed:', err.message);
          // Fallback to postMessage
          if (window.opener) {
            window.opener.postMessage(message, window.location.origin);
            console.log('[Callback] Message sent via postMessage');
          }
        }

        // Close the popup after a short delay
        setTimeout(() => {
          console.log('[Callback] Closing popup');
          window.close();
        }, 1000);
      } catch (err) {
        console.error('[Callback] Error:', err.message);

        const message = {
          type: 'oauth-callback',
          success: false,
          error: err.message,
          receivedAt: new Date().toISOString(),
        };

        try {
          const channel = new BroadcastChannel('oauth-callback');
          channel.postMessage(message);
          channel.close();
        } catch {
          if (window.opener) {
            window.opener.postMessage(message, window.location.origin);
          }
        }

        setTimeout(() => {
          window.close();
        }, 2000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner}></div>
        <h2 style={styles.title}>Processing OAuth Callback</h2>
        <p style={styles.text}>Exchanging authorization code for tokens...</p>
        <p style={{ ...styles.text, fontSize: '12px', color: '#666', marginTop: '20px' }}>
          This window will close automatically.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'white',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    textAlign: 'center',
    maxWidth: '400px',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  title: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '20px',
    fontWeight: '600',
  },
  text: {
    margin: '10px 0',
    color: '#666',
    fontSize: '14px',
  },
};

// Add CSS animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}


