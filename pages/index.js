import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Okta Authentication Flows Simulator</title>
        <meta name="description" content="Interactive demonstrations for OAuth 2.0 and OpenID Connect flows" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={styles.container}>
        <header style={styles.header}>
          <h1>🔐 Okta Authentication Flows Simulator</h1>
          <p>Interactive demonstrations for OAuth 2.0 and OpenID Connect flows</p>
          <p style={styles.version}>Next.js Edition v2.0.0 - Powered by Vercel</p>
        </header>

        <main style={styles.main}>
          <section style={styles.section}>
            <h2>Pre-built Flow Simulators</h2>
            <div style={styles.grid}>
              <FlowCard 
                title="Authorization Code Flow" 
                desc="Standard OAuth 2.0 flow with PKCE support"
                href="/auth-code-flow.html"
              />
              <FlowCard 
                title="Agentic Token Exchange" 
                desc="User-to-AI-Agent delegation with ID-JAG tokens"
                href="/agentic-token-exchange.html"
              />
              <FlowCard 
                title="Device Authorization Grant" 
                desc="OAuth 2.0 Device Flow for input-constrained devices"
                href="/device-grant-flow.html"
              />
              <FlowCard 
                title="Token Exchange" 
                desc="RFC 8693 Token Exchange for impersonation"
                href="/token-exchange-flow.html"
              />
              <FlowCard 
                title="Native to Web" 
                desc="Seamless SSO from native apps to web"
                href="/native-to-web-flow.html"
              />
              <FlowCard 
                title="Direct Authentication" 
                desc="Passwordless authentication flows"
                href="/direct-auth-flow.html"
              />
            </div>
          </section>

          <section style={styles.section}>
            <h2>Getting Started</h2>
            <div style={styles.steps}>
              <StepCard 
                number="1" 
                title="Setup Configuration" 
                desc="Configure your Okta organization"
              />
              <StepCard 
                number="2" 
                title="Select a Flow" 
                desc="Choose a flow to simulate"
              />
              <StepCard 
                number="3" 
                title="See the Details" 
                desc="View tokens, JWT structures, and cURL commands"
              />
            </div>
          </section>

          <section style={styles.section}>
            <h2>Features</h2>
            <ul style={styles.list}>
              <li>✅ Real OAuth 2.0 flows with Okta</li>
              <li>✅ JWT token inspection</li>
              <li>✅ cURL command generation</li>
              <li>✅ QR code generation</li>
              <li>✅ Custom flow builder</li>
              <li>✅ Session-based logging</li>
              <li>✅ Multiple IdP management</li>
              <li>✅ PKCE support</li>
            </ul>
          </section>

          <section style={styles.cta}>
            <h2>Ready to Begin?</h2>
            <button style={styles.button} onClick={() => window.location.href = '/setup.html'}>
              Start Setup →
            </button>
          </section>
        </main>

        <footer style={styles.footer}>
          <p>© 2026 Okta Authentication Flows Simulator | Next.js + Vercel</p>
          <p style={styles.links}>
            <a href="/docs/flow-builder.html">Documentation</a> • 
            <a href="https://github.com"> GitHub</a>
          </p>
        </footer>
      </div>
    </>
  );
}

function FlowCard({ title, desc, href }) {
  return (
    <div style={styles.card}>
      <h3>{title}</h3>
      <p>{desc}</p>
      <a href={href} style={styles.cardLink}>Launch Flow →</a>
    </div>
  );
}

function StepCard({ number, title, desc }) {
  return (
    <div style={styles.stepCard}>
      <div style={styles.stepNumber}>{number}</div>
      <h4>{title}</h4>
      <p>{desc}</p>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight: 1.6,
    color: '#333',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '60px 20px',
    textAlign: 'center',
  },
  version: {
    fontSize: '14px',
    opacity: 0.9,
    marginTop: '10px',
  },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  section: {
    marginBottom: '60px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    background: '#f9f9f9',
    transition: 'transform 0.2s, boxShadow 0.2s',
    cursor: 'pointer',
  },
  cardLink: {
    color: '#667eea',
    textDecoration: 'none',
    fontWeight: 'bold',
    marginTop: '10px',
    display: 'inline-block',
  },
  steps: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  stepCard: {
    padding: '20px',
    border: '2px solid #667eea',
    borderRadius: '8px',
    background: '#f0f3ff',
  },
  stepNumber: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: '10px',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    columns: 2,
    columnGap: '40px',
  },
  cta: {
    textAlign: 'center',
    padding: '40px',
    background: '#f9f9f9',
    borderRadius: '8px',
    marginTop: '60px',
  },
  button: {
    background: '#667eea',
    color: 'white',
    border: 'none',
    padding: '15px 40px',
    fontSize: '16px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '20px',
  },
  footer: {
    background: '#333',
    color: 'white',
    padding: '40px 20px',
    textAlign: 'center',
    marginTop: '60px',
  },
  links: {
    marginTop: '10px',
  },
};
