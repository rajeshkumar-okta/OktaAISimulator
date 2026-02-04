import React, { useEffect } from 'react';

export default function Callback() {
  useEffect(() => {
    // Extract query parameters
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Prepare message to send to parent window
    const message = {
      type: 'oauth-callback',
      code,
      state,
      success: !error && code ? true : false,
      error: error ? `${error}: ${errorDescription || 'Unknown error'}` : null,
      receivedAt: new Date().toISOString(),
    };

    console.log('[Callback] OAuth response received:', message);

    // Try BroadcastChannel first (most reliable)
    try {
      const channel = new BroadcastChannel('oauth-callback');
      channel.postMessage(message);
      console.log('[Callback] Message sent via BroadcastChannel');
      channel.close();
    } catch (err) {
      console.log('[Callback] BroadcastChannel failed:', err.message);
      // Fallback to postMessage for browsers without BroadcastChannel support
      if (window.opener) {
        window.opener.postMessage(message, window.location.origin);
        console.log('[Callback] Message sent via postMessage');
      } else {
        console.log('[Callback] No window.opener available');
      }
    }

    // Close the popup after a short delay
    setTimeout(() => {
      console.log('[Callback] Closing popup');
      window.close();
    }, 1000);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner}></div>
        <h2 style={styles.title}>Processing OAuth Callback</h2>
        <p style={styles.text}>Please wait while we process your login...</p>
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

