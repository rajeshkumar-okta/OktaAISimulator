# CLAUDE.md - AI Assistant Guide for Okta AI Simulator

This document provides essential information for AI assistants working with this codebase.

## Project Overview

This is the **Okta Authentication Flows Simulator** - a Node.js web application for **educational and testing purposes**. It provides interactive demonstrations and testing tools for OAuth 2.0 and OpenID Connect flows. It is not intended for production use.

### Pre-built Flow Simulators

- **Authorization Code Flow** - Standard OAuth 2.0 with PKCE, client secrets, and private key authentication
- **Agentic Token Exchange** - Agent/workload identity flows for AI agents using RFC 8693 Token Exchange and RFC 7523 JWT Bearer assertions
- **Device Authorization Grant** - RFC 8628 device flow for input-constrained devices (smart TVs, CLI tools, IoT)
- **Token Exchange** - RFC 8693 token exchange for impersonation and delegation scenarios
- **Native SSO to Web** - Device SSO token exchange for native-to-web single sign-on
- **Direct Authentication** - Okta Identity Engine direct authentication API for passwordless and MFA flows

### Custom Flow Builder

Users can create custom OAuth/OIDC flows using a JSON-driven flow definition system with:
- Visual step editor with drag-and-drop reordering
- Sub functions (reusable server-side operations) that can be chained in steps
- Expression autocomplete for template variables (`{{config.x}}`, `{{state.x}}`, `{{subFn.id.output}}`)
- QR code generation for buttons and cURL displays
- Configuration persistence to browser or server

## Technology Stack

### Backend
- **Node.js 18+** with ES modules (`"type": "module"` in package.json)
- **Express.js** ^4.21.0 - HTTP server framework
- **jose** ^5.6.3 - JWT creation/verification and cryptographic operations
- **qrcode** ^1.5.4 - QR code generation
- **dotenv** ^16.4.5 - Environment variable management
- **open** ^10.1.0 - Auto-opens browser on startup

### Frontend
- Vanilla JavaScript (ES6+) with no build step
- Flow Engine library (`src/public/lib/flow-engine/`) for JSON-driven flows
- HTML5 with responsive design
- CSS3 with dark theme styling
- BroadcastChannel API for inter-window communication

### Security
- RSA-2048 and ECDSA key support
- PKCE (Proof Key for Code Exchange)
- JWT Bearer assertions (RFC 7523)
- Token Exchange (RFC 8693)
- JWKS (JSON Web Key Set) verification

## Versioning

Application version is sourced from `package.json` and exported from `server.js`:
- `APP_VERSION` and `APP_NAME` are exported globals
- `GET /api/.well-known` returns `{ name, version, description }`

## Directory Structure

```
src/
├── server.js                 # Express entry point, version globals, setup detection
├── config.js                 # Port config + validation helpers
├── routes/
│   ├── oauth.js              # OAuth authorize + callback endpoints
│   ├── steps.js              # Agentic flow step endpoints
│   ├── newFlows.js           # Device grant, token exchange, native-to-web, direct auth
│   ├── flows.js              # Flow CRUD API (JSON flow definitions)
│   ├── configs.js            # Configuration CRUD API
│   ├── settings.js           # Settings management API
│   ├── logs.js               # Debug logging API
│   ├── idps.js               # Identity Provider management API
│   ├── utility.js            # Utility endpoints (QR code generation)
│   └── subFunctions.js       # Sub functions API (list, execute, chain)
├── services/
│   ├── jwtService.js         # JWT assertion creation for client auth
│   ├── tokenExchange.js      # Token exchange operations
│   ├── logger.js             # Request/response logging system
│   ├── settingsStore.js      # Settings persistence
│   └── subFunctions/         # Reusable sub functions for flow builder
│       ├── index.js           # Registry, executor, template resolver
│       ├── createJwtAssertion.js  # RFC 7523 JWT client assertion
│       ├── tokenExchange.js   # RFC 8693 token exchange
│       ├── jwtBearerGrant.js  # RFC 7523 JWT bearer grant
│       ├── decodeJwt.js       # JWT decoder (no validation)
│       └── httpRequest.js     # Generic HTTP with cURL generation
├── flows/
│   ├── registry.js           # Flow definitions registry (loads JSON files)
│   ├── definitions/          # JSON flow definitions (pre-built + custom)
│   │   ├── auth-code.json
│   │   └── device-grant.json
│   └── schema/
│       └── flow-schema.json  # Flow definition JSON schema
├── state/
│   └── sessionStore.js       # In-memory state management
└── public/
    ├── index.html            # Main dashboard with flow tiles
    ├── flow.html             # Generic flow renderer (JSON-driven)
    ├── setup.html            # Setup wizard for first-time config
    ├── login.html            # Login page
    ├── settings.html         # Settings page
    ├── manage-idps.html      # IdP management interface
    ├── auth-code-flow.html   # Authorization Code Flow simulator
    ├── agentic-token-exchange.html # Agentic flow simulator
    ├── device-grant-flow.html      # Device Authorization Grant simulator
    ├── token-exchange-flow.html    # Token Exchange simulator
    ├── native-to-web-flow.html     # Native SSO to Web simulator
    ├── direct-auth-flow.html       # Direct Authentication simulator
    ├── log-viewer.html       # Debug log viewer
    ├── styles.css            # Shared styling
    ├── auth-code-app.js      # Auth Code flow frontend logic
    ├── agentic-app.js        # Agentic flow frontend logic
    ├── device-grant-app.js   # Device Grant flow frontend logic
    ├── token-exchange-app.js # Token Exchange flow frontend logic
    ├── native-to-web-app.js  # Native to Web flow frontend logic
    ├── direct-auth-app.js    # Direct Authentication flow frontend logic
    ├── setup-app.js          # Setup wizard frontend
    ├── settings-app.js       # Settings frontend
    ├── manage-idps-app.js    # IdP management frontend
    ├── docs/
    │   └── flow-builder.html # Flow builder documentation
    └── lib/
        └── flow-engine/      # Shared flow engine components
            ├── index.js           # Module exports
            ├── FlowEngine.js      # Runtime engine for JSON flows
            ├── FlowRenderer.js    # HTML generation from JSON definitions
            ├── DialogManager.js   # Promise-based modal dialogs
            ├── ConfigManager.js   # Configuration persistence
            ├── StepController.js  # Step UI state management
            ├── CurlGenerator.js   # cURL command formatting
            ├── TokenDisplay.js    # Token decoding and display
            ├── ScopeSelector.js   # OAuth scope selection UI
            ├── AuthServerPicker.js # Authorization server selection
            ├── SettingsPicker.js  # Centralized org/app/agent selection
            └── ExpressionAutocomplete.js # Autocomplete for {{variable}} expressions

data/
└── idps/                     # Server-side IdP configurations (JSON, gitignored)

docs/
├── AI Agent Flow.postman_collection.json # Postman API collection
├── native-to-web-app.json   # Native to Web flow documentation
└── roadmap.md               # Planned features and TODOs
```

## Development Workflows

### Installation
```bash
npm install
```

### Development (with auto-reload)
```bash
npm run dev
```

### Production
```bash
npm start
```

The app automatically opens `http://localhost:3000` in the browser on startup.

### Environment Variables
- `PORT` - Server port (defaults to 3000)
- No `.env` file is required - all configuration is managed through the web UI

## Coding Conventions

### JavaScript Style
- ES modules with `import`/`export` syntax (not CommonJS)
- Async/await for asynchronous operations
- Arrow functions for callbacks and short functions
- Template literals for string interpolation
- Descriptive variable and function names

### Express Routes Pattern
```javascript
import { Router } from 'express';
const router = Router();

router.get('/endpoint', (req, res) => {
  res.json({ data });
});

export default router;
```

### Sub Function Module Pattern
Each sub function in `/src/services/subFunctions/` is a self-contained module:
```javascript
export default {
  id: 'functionId',
  name: 'Human Name',
  category: 'jwt|oauth|http',
  description: 'Educational description...',
  inputs: {
    paramName: { type: 'string', required: true, description: '...', example: '...' }
  },
  outputs: {
    outputName: { type: 'string', description: '...' }
  },
  async execute(inputs, context) {
    // Well-commented implementation
    return { outputs: { ... }, curl: '...' };
  }
};
```

### Service Functions Pattern
- Export named functions for services
- Use JSDoc comments for function documentation
- Throw errors with `[Local App]` prefix for user-facing errors
- Return structured objects with clear property names

### Error Handling
- Use try/catch blocks in route handlers
- Log errors with the logger service: `logger.logError(step, err)`
- Return errors with HTTP status codes and JSON: `res.status(500).json({ error: err.message })`
- Include `logTimestamp` in error responses for debugging

### Frontend Patterns
- Single-page applications per flow (pre-built flows)
- JSON-driven flows use `flow.html` with `FlowEngine` (custom flows)
- DOM manipulation with vanilla JavaScript
- Event delegation for dynamic elements
- localStorage for client-side persistence
- BroadcastChannel for cross-window communication

## API Endpoints

### Well-Known
- `GET /api/.well-known` - Returns app name, version, and description

### OAuth Routes
- `POST /api/oauth/authorize` - Initiates OAuth flow
- `GET /callback` - OAuth redirect handler

### Steps Routes (Agentic Flow)
- `GET /api/steps/state` - Returns current flow state
- `POST /api/steps/reset` - Reset state and start new session
- `POST /api/steps/set-token` - Store existing token for reuse
- `POST /api/steps/agentic/2` - Agentic token exchange for ID-JAG
- `POST /api/steps/agentic/3` - Agentic JWT Bearer grant
- `POST /api/steps/agentic/4` - Test access token with API

### Flow Routes
- `GET /api/flows` - List all flow definitions
- `GET /api/flows/:id` - Get a flow definition by ID
- `PUT /api/flows/:id` - Update a flow definition
- `POST /api/flows` - Create a new flow definition
- `DELETE /api/flows/:id` - Delete a flow definition

### Configuration Routes
- `GET /api/configs` - List saved configurations
- `POST /api/configs` - Create new configuration
- `GET/PUT/DELETE /api/configs/:id` - CRUD operations

### Settings Routes
- `GET /api/settings` - Get application settings
- `PUT /api/settings` - Update application settings

### IdP Management Routes
- `GET /api/idps` - List identity providers
- `POST /api/idps` - Create new IdP
- `GET /api/idps/check` - Check if IdPs exist
- `GET /api/idps/primary` - Get primary IdP
- `GET/PUT/DELETE /api/idps/:id` - CRUD operations

### Logging Routes
- `GET /api/logs` - List all log files with metadata
- `GET /api/logs/current` - Get current session log
- `GET /api/logs/current/last-error` - Get last error from session

### Utility Routes
- `GET /api/utility/qr/:type/:data` - Generate QR code PNG
  - Supports `url` type with optional `size`, `margin`, `dark`, `light` query params
  - Special data value `BLANK_PLACEHOLDER` returns a transparent 1x1 PNG

### Device Authorization Grant Routes
- `POST /api/device/authorize` - Request device code and user code
- `POST /api/device/token` - Poll for access token using device code

### Token Exchange Routes
- `POST /api/token-exchange/exchange` - Exchange subject token (RFC 8693)
- `POST /api/token-exchange/verify` - Verify exchanged token

### Native to Web SSO Routes
- `POST /api/native-to-web/exchange` - Exchange ID token + device secret for web SSO token

### Direct Authentication Routes
- `POST /api/direct-auth/authenticate` - Primary authentication (password, OTP, OOB)
- `POST /api/direct-auth/mfa` - Complete MFA verification
- `POST /api/direct-auth/mfa-poll` - Poll for OOB MFA completion

### Sub Functions Routes
- `GET /api/sub-functions` - List all available sub functions with metadata
- `GET /api/sub-functions/categories` - List categories with function counts
- `GET /api/sub-functions/:id` - Get detailed info about a specific function
- `POST /api/sub-functions/:id/execute` - Execute a single sub function
- `POST /api/sub-functions/chain` - Execute a chain of sub functions in sequence

## Key Implementation Details

### Server Entry Point (`src/server.js`)
- Reads version from `package.json` and exports `APP_VERSION`, `APP_NAME`
- Setup detection: redirects to `/setup.html` if no IdPs configured
- Middleware bypasses setup check for API routes, static assets, and auth pages
- `/api/.well-known` endpoint for version discovery

### Session Store
- In-memory state management (single-user demo)
- State includes OAuth tokens, PKCE verifiers, and step results
- Reset with `store.reset()` for new sessions

### JWT Operations
- Use `jose` library for all JWT operations
- `createAgenticClientAssertion()` for agent/workload principals
- Always validate private keys contain the "d" field

### Configuration Validation
- `validateBasicOAuthConfig()` - Basic OAuth fields
- `validateAgenticConfig()` - Agentic flow config
- Return error strings or null for valid configs

### Logging System
- Session-based logging with flow type and user tracking
- Logs stored in `logs/` directory as text files with JSON metadata
- cURL commands logged for debugging and reproduction
- Step-based logging for flow progression

### Flow Engine (`src/public/lib/flow-engine/`)
The flow engine renders and executes JSON-driven flows:
- **FlowRenderer** - Generates HTML from flow JSON (config panel, steps, modals)
- **FlowEngine** - Runtime: loads definitions, binds events, executes step actions
- **Step Edit Modal** - Tabbed editor with Basic, Button, Endpoints, cURL, API, Polling, On Success, Sub Functions tabs
- **ExpressionAutocomplete** - Dropdown when typing `{{` showing available variables grouped by category (Config, State, Response, Sub Function)

### Sub Functions (Custom Flow Builder)
Reusable server-side operations for the custom flow builder:

**Available Functions:**

| ID | Category | Spec | Description |
|----|----------|------|-------------|
| `createJwtAssertion` | jwt | RFC 7523 | Sign a JWT using a private JWK for client authentication |
| `tokenExchange` | oauth | RFC 8693 | Exchange one token for another |
| `jwtBearerGrant` | oauth | RFC 7523 | Use a JWT as an authorization grant |
| `decodeJwt` | jwt | RFC 7519 | Decode a JWT to inspect header and payload (no validation) |
| `httpRequest` | http | - | Make an HTTP request with cURL generation |

**Function Structure:**
Each function in `/src/services/subFunctions/` exports:
- `id`, `name`, `category`, `description` - Self-documenting metadata
- `inputs` - Parameters with types, required flag, description, and example
- `outputs` - Return values with descriptions
- `execute(inputs, context)` - Implementation with educational step-by-step comments

**Registry (`index.js`):**
- Template expression resolver: `{{config.x}}`, `{{state.x}}`, `{{subFn.id.output}}`
- Input validation against function definitions
- Chain executor for multi-step operations with accumulated results

**Usage in Flow JSON:**
```json
{
  "subFunctions": [
    { "fn": "createJwtAssertion", "id": "clientAuth", "inputs": {...} },
    { "fn": "tokenExchange", "id": "exchange", "inputs": { "clientAssertion": "{{subFn.clientAuth.assertion}}" }, "storeResults": [{ "from": "access_token", "to": "newToken" }] }
  ],
  "button": { "action": "subFunctions" }
}
```

### QR Code Generation
- Server-side QR via `/api/utility/qr/url/:data`
- `BLANK_PLACEHOLDER` returns transparent 1x1 PNG (avoids layout jolt)
- Used in step buttons (`button.showAsQR`) and cURL displays (`curl.showAsQR`)

## Testing

### Manual Testing
- Use the web UI to test flows interactively
- Log viewer at `/log-viewer.html` for debugging
- cURL commands displayed for each API call
- `GET /api/.well-known` to verify server version

### Utility Scripts
- `test-client-auth.js` - Tests JWT client assertion
- `extract-public-key.js` - Extracts public key from JWK

### Postman Collection
- `docs/AI Agent Flow.postman_collection.json` for API testing

## Security Considerations

### Sensitive Data
- Never commit `.env` files
- IdP configurations contain secrets - stored in `data/idps/` (gitignored)
- Private JWKs should only be used in test/demo contexts

### Input Validation
- Directory traversal prevention in log file access
- Configuration validation before use
- State parameter validation for OAuth

### Client Authentication Methods
1. Client Secret (Basic Auth)
2. Private Key JWT (client_assertion)
3. PKCE (Public Client)

## Common Tasks

### Adding a New Pre-built Flow
1. Create HTML page in `src/public/`
2. Create frontend JS file (e.g., `new-flow-app.js`)
3. Add route handlers in `src/routes/`
4. Update `src/server.js` if new routes needed
5. Add tile to `index.html` dashboard

### Adding a New JSON-driven Flow
1. Create flow definition JSON in `src/flows/definitions/`
2. Flow appears automatically on the dashboard
3. Use `flow.html?flow=<id>` to render it
4. Configure steps, config fields, and sub functions in the JSON

### Adding a New Sub Function
1. Create module in `src/services/subFunctions/` following the pattern
2. Import and add to registry in `src/services/subFunctions/index.js`
3. Function automatically appears in the Sub Functions tab and API

### Adding a New API Endpoint
1. Add route handler in appropriate `src/routes/*.js` file
2. Add service functions in `src/services/` if needed
3. Use middleware for config validation
4. Follow existing error handling patterns
5. Add logging with step numbers

### Modifying Token Exchange Logic
1. Edit `src/services/tokenExchange.js`
2. Update logging messages
3. Include cURL command generation for debugging
4. Test with real Okta organization

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for planned features and TODOs.

## References

- [RFC 8693 - OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693)
- [RFC 7523 - JWT Bearer Assertion](https://www.rfc-editor.org/rfc/rfc7523)
- [RFC 7519 - JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8628 - OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628)
- [Okta OAuth 2.0 Documentation](https://developer.okta.com/docs/concepts/oauth-openid/)
- [Okta Direct Authentication](https://developer.okta.com/docs/guides/configure-direct-auth-grants/)
- [Okta Device SSO](https://developer.okta.com/docs/guides/configure-native-sso/)
