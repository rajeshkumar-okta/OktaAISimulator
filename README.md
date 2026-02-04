# Okta Authentication Flows Simulator

> **This application is for educational and testing purposes only.** It is designed to help developers, learners, and testers understand OAuth 2.0 and OpenID Connect authentication patterns through interactive, hands-on simulators. It is not intended for production use. Tokens, keys, and credentials used with this application should be from development/test environments only.

---

Interactive simulators for OAuth 2.0 and OpenID Connect flows using Okta. This Node.js web application provides hands-on demonstrations of various authentication patterns with full visibility into the underlying protocol mechanics - including cURL commands, JWT structures, and token exchange sequences.

## Features

### Pre-built Flow Simulators

- **Authorization Code Flow** - Standard OAuth 2.0 Authorization Code flow with support for PKCE, client secret, and private key authentication methods
- **Agentic Token Exchange Flow** - Demonstrates User-to-AI-Agent delegation using ID-JAG tokens with RFC 8693 Token Exchange and RFC 7523 JWT Bearer assertions
- **Device Authorization Grant** - OAuth 2.0 Device Authorization Grant (RFC 8628) for input-constrained devices like smart TVs, CLI tools, and IoT devices
- **Token Exchange** - RFC 8693 Token Exchange for exchanging tokens between different token types, impersonation, and delegation scenarios
- **Native SSO to Web** - Seamless single sign-on from native mobile applications to web applications using device SSO tokens
- **Direct Authentication** - Okta's Direct Authentication API for passwordless and MFA flows without browser redirects

### Custom Flow Builder

Build your own OAuth/OIDC flows using a JSON-driven flow definition system:

- **Visual step editor** with drag-and-drop reordering
- **Sub functions** - reusable server-side operations (JWT signing, token exchange, HTTP requests) that can be chained together in steps
- **Expression autocomplete** - template variables (`{{config.x}}`, `{{state.x}}`, `{{subFn.id.output}}`) with dropdown suggestions
- **QR code generation** - replace buttons or cURL displays with scannable QR codes
- **Configuration persistence** - save/load configurations to browser or server

### Key Capabilities

- Setup wizard for first-time configuration
- Multiple Identity Provider (IdP) management
- Session-based authentication (24-hour sessions)
- Configuration persistence (browser localStorage or server-side)
- Support for multiple client authentication methods:
  - Client Secret
  - Public Key / Private Key (JWT client assertion)
  - PKCE (Public Client)
- Real-time logging and cURL command generation for debugging

## Prerequisites

- Node.js 18+
- An Okta organization with an OAuth 2.0 application configured

### For Authorization Code Flow
- OAuth 2.0 Web Application with `http://localhost:3000/callback` as a redirect URI

### For Agentic Token Exchange Flow
- OAuth 2.0 application (confidential client) with Token Exchange enabled
- Custom Authorization Server
- Agent/Workload principal with RSA key pair

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Application

```bash
npm start
```

The app opens `http://localhost:3000` in your browser automatically.

For development with auto-reload:

```bash
npm run dev
```

### 3. Complete the Setup Wizard

On first launch, you'll be guided through a setup wizard to configure your primary Identity Provider:

1. **Welcome** - Overview of the application
2. **Configure IdP** - Enter your Okta domain, Client ID, and Client Secret
3. **Authenticate** - Log in with your IdP to verify the configuration

After setup, you'll be redirected to the main dashboard.

## Configuration

### Setup Wizard (First-Time Setup)

The setup wizard runs automatically when no IdPs are configured. It collects:

| Field | Description |
|-------|-------------|
| Authorization Server URL | Your Okta domain (e.g., `https://your-domain.okta.com`) |
| Client ID | OAuth 2.0 Client ID |
| Client Secret | OAuth 2.0 Client Secret |

### Managing Identity Providers

After initial setup, you can manage multiple IdPs from the **Manage IdPs** page:

- Add new Identity Providers
- Edit existing IdP configurations
- Set a primary IdP for login
- Delete IdPs

## Usage

### Authorization Code Flow

1. Configure the Okta application settings
2. Click **Generate Token** to initiate the OAuth flow
3. Authenticate in the popup window
4. View the returned ID token, access token, and refresh token

### Agentic Token Exchange Flow

1. Configure all required settings in the Configuration panel
2. **Step 1** - Authenticate or use an existing token
3. **Step 2** - Exchange the token for an ID-JAG token (RFC 8693 Token Exchange)
4. **Step 3** - Exchange the ID-JAG token for an Auth Server access token (RFC 7523 JWT Bearer)
5. **Step 4** - Test the access token with an API request

Each step unlocks after the previous one completes. Results display decoded token claims.

### Custom Flow Builder

1. Navigate to the dashboard and create a new custom flow
2. Toggle **Edit** mode to modify steps
3. Add steps with buttons, API calls, polling, or sub functions
4. Configure sub functions to chain server-side operations (e.g., sign a JWT then exchange it for a token)
5. Use `{{expression}}` syntax in templates to reference config, state, or sub function outputs

## Architecture

```
src/
├── server.js                 # Express entry point with setup detection
├── config.js                 # Port config + validation helpers
├── routes/
│   ├── oauth.js              # OAuth authorize + callback
│   ├── steps.js              # Agentic flow step endpoints
│   ├── newFlows.js           # Device grant, token exchange, native-to-web, direct auth
│   ├── flows.js              # Flow CRUD API (JSON flow definitions)
│   ├── configs.js            # Configuration CRUD API
│   ├── settings.js           # Settings API
│   ├── logs.js               # Logging API
│   ├── idps.js               # Identity Provider management API
│   ├── utility.js            # Utility endpoints (QR code generation)
│   └── subFunctions.js       # Sub functions API (list, execute, chain)
├── services/
│   ├── jwtService.js         # JWT assertion creation
│   ├── tokenExchange.js      # Token exchange operations
│   ├── logger.js             # Request/response logging
│   ├── settingsStore.js      # Settings persistence
│   └── subFunctions/         # Reusable sub functions for flow builder
│       ├── index.js           # Registry, executor, template resolver
│       ├── createJwtAssertion.js  # RFC 7523 JWT client assertion
│       ├── tokenExchange.js   # RFC 8693 token exchange
│       ├── jwtBearerGrant.js  # RFC 7523 JWT bearer grant
│       ├── decodeJwt.js       # JWT decoder (no validation)
│       └── httpRequest.js     # Generic HTTP with cURL generation
├── flows/
│   └── definitions/          # JSON flow definitions (pre-built + custom)
├── state/
│   └── sessionStore.js       # In-memory state
├── public/
│   ├── index.html            # Main dashboard with flow tiles
│   ├── flow.html             # Generic flow renderer (JSON-driven)
│   ├── login.html            # Login page
│   ├── setup.html            # Setup wizard
│   ├── settings.html         # Settings page
│   ├── manage-idps.html      # IdP management page
│   ├── auth-code-flow.html   # Authorization Code Flow simulator
│   ├── agentic-token-exchange.html # Agentic flow simulator
│   ├── device-grant-flow.html      # Device Authorization Grant simulator
│   ├── token-exchange-flow.html    # Token Exchange simulator
│   ├── native-to-web-flow.html     # Native to Web flow simulator
│   ├── direct-auth-flow.html       # Direct Authentication simulator
│   ├── log-viewer.html       # Debug log viewer
│   ├── styles.css            # Shared styles
│   └── lib/
│       └── flow-engine/      # Shared flow engine components
│           ├── index.js       # Module exports
│           ├── FlowEngine.js  # Runtime engine for JSON flows
│           ├── FlowRenderer.js # HTML generation from JSON definitions
│           ├── DialogManager.js
│           ├── ConfigManager.js
│           ├── StepController.js
│           ├── CurlGenerator.js
│           ├── TokenDisplay.js
│           ├── ScopeSelector.js
│           ├── AuthServerPicker.js
│           ├── SettingsPicker.js
│           └── ExpressionAutocomplete.js
└── data/
    └── idps/                 # Server-side IdP configurations (JSON)
```

## Sub Functions

Sub functions are reusable server-side operations designed for the custom flow builder. Each function is self-documenting with detailed descriptions, input/output specifications, and well-commented implementation code for educational purposes.

| Function | Category | Spec | Description |
|----------|----------|------|-------------|
| `createJwtAssertion` | jwt | RFC 7523 | Sign a JWT using a private JWK for client authentication |
| `tokenExchange` | oauth | RFC 8693 | Exchange one token for another (impersonation, delegation) |
| `jwtBearerGrant` | oauth | RFC 7523 | Use a JWT as an authorization grant to obtain tokens |
| `decodeJwt` | jwt | RFC 7519 | Decode a JWT to inspect header and payload (no validation) |
| `httpRequest` | http | - | Make an HTTP request with cURL command generation |

Sub functions can be chained in flow steps. Each function's outputs are available to subsequent functions via `{{subFn.<stepId>.<output>}}` template expressions.

### API

```
GET  /api/sub-functions           # List all functions with metadata
GET  /api/sub-functions/:id       # Get function details (inputs, outputs, description)
POST /api/sub-functions/:id/execute  # Execute a single function
POST /api/sub-functions/chain     # Execute a chain of functions in sequence
```

## Important Notes

- This is an educational/testing tool - use only with development Okta organizations
- Ensure `http://localhost:3000/callback` is registered as a redirect URI in your Okta application
- Sessions expire after 24 hours of inactivity
- No `.env` file is required - all configuration is managed through the web UI
- IdP configurations are stored in `data/idps/` as JSON files

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for planned features, improvements, and technical debt tracking.

## References

- [RFC 8693 - OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693)
- [RFC 7523 - JWT Bearer Assertion](https://www.rfc-editor.org/rfc/rfc7523)
- [RFC 7519 - JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8628 - OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628)
- [Okta OAuth 2.0 Documentation](https://developer.okta.com/docs/concepts/oauth-openid/)
- [Okta Direct Authentication](https://developer.okta.com/docs/guides/configure-direct-auth-grants/)
- [Okta Device SSO](https://developer.okta.com/docs/guides/configure-native-sso/)
