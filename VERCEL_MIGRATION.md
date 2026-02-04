# Vercel Deployment Guide

This document describes the conversion of the Okta Authentication Flows Simulator from a traditional Express.js application to a Vercel serverless deployment.

## Overview of Changes

### Architecture Changes

1. **Serverless Functions**: Traditional Express routes are now Vercel serverless functions (`/api` directory)
2. **Static Files**: Public files remain in `/src/public` and are served as static assets
3. **State Management**: Session store converted to use in-memory storage compatible with serverless
4. **Logging**: Logger adapted to work with ephemeral function instances

### Key Files Modified/Added

#### New Files
- `vercel.json` - Vercel deployment configuration
- `.vercelignore` - Files to ignore during deployment
- `api/` - Directory containing serverless function handlers
  - `api/oauth/authorize.js` - OAuth authorization endpoint
  - `api/logs/index.js` - Logging endpoints
  - `api/configs/index.js` - Configuration endpoints
  - `api/state/index.js` - Session state endpoints
  - `api/well-known.js` - Well-known endpoint
- `src/state/sessionStore-serverless.js` - Serverless-compatible session store
- `src/services/logger-serverless.js` - Serverless-compatible logger

#### Modified Files
- `package.json` - Added Vercel build scripts

## Deployment Instructions

### Prerequisites
- Vercel account (https://vercel.com)
- Vercel CLI installed: `npm i -g vercel`
- Node.js 18+ locally

### Local Development

```bash
# Install dependencies
npm install

# Run locally with Vercel dev server
npm run vercel-dev

# Or run the traditional Express server
npm run dev
```

### Deploy to Vercel

#### Option 1: Using Vercel CLI
```bash
# Login to Vercel
vercel login

# Deploy to staging
vercel --prod

# Deploy to production
vercel --prod
```

#### Option 2: Git Integration (Recommended)
1. Push code to GitHub, GitLab, or Bitbucket
2. Connect your repository to Vercel
3. Vercel will automatically deploy on every push to main branch

### Environment Variables

Set these in your Vercel project settings:

```
VERCEL_ENV=production
NODE_ENV=production
```

## Important Limitations & Considerations

### 1. Ephemeral Storage
On Vercel, each serverless function instance is ephemeral. This means:

- **Session State**: State is stored in memory per function instance and lost when the function terminates
- **Logs**: Logs are stored in memory and not persisted between requests (unless you implement persistence)
- **Configurations**: Cannot be saved to disk like in the traditional app

**Solution**: For production use, implement one of these:

#### Option A: Use Vercel KV (Redis)
```javascript
import { kv } from '@vercel/kv';

// Store state
await kv.set(`session:${sessionId}`, JSON.stringify(state));

// Retrieve state
const state = await kv.get(`session:${sessionId}`);
```

[Learn more](https://vercel.com/docs/storage/vercel-kv)

#### Option B: Use a Database
Connect to your preferred database (PostgreSQL, MongoDB, etc.)

#### Option C: Use Browser Storage + URL Parameters
Store state in browser localStorage and pass session IDs via URL

### 2. File System Access
The serverless functions have limited file system access:
- Can read files from the deployment
- Cannot persist files (use `/tmp` only for temporary data)
- IDP data and settings should be moved to a database or KV store

### 3. Request Timeout
- Default: 10 seconds
- Maximum: 60 seconds
- Increase in `vercel.json` if needed

### 4. No Auto-Open Browser
The `open` package won't work on serverless. Users must manually navigate to the deployed URL.

## Mapping: Express Routes → Serverless Functions

### Original Express Routes
```
POST /api/oauth/authorize          → api/oauth/authorize.js
POST /api/oauth/callback           → api/oauth/callback.js
GET  /api/logs                     → api/logs/index.js
POST /api/configs                  → api/configs/index.js
GET  /api/.well-known              → api/well-known.js
```

### Static Files
All files in `src/public/` are served as static assets:
- `/setup.html` → `src/public/setup.html`
- `/auth-code-flow.html` → `src/public/auth-code-flow.html`
- etc.

## Troubleshooting

### Issue: "Cannot find module"
**Solution**: Check that imports use correct paths relative to the function file

### Issue: State is lost between requests
**Solution**: This is expected on serverless. Store state client-side or use a database

### Issue: 504 Gateway Timeout
**Solution**: Your function is taking too long. Optimize or increase `maxDuration` in `vercel.json`

### Issue: Environment variables not loading
**Solution**: Add them in Vercel project settings → Settings → Environment Variables

## Performance Tips

1. **Cold Starts**: First call takes longer (cold start). Subsequent calls are faster
2. **Concurrency**: Vercel handles auto-scaling - don't worry about load
3. **Caching**: Use Vercel's caching for static files (configured in `vercel.json`)

## Next Steps for Production

1. **Add Database**
   - Use Vercel KV for session/logs
   - Or connect to PostgreSQL/MongoDB for IDP configs

2. **Add Authentication**
   - Implement proper session management
   - Consider Vercel's NextAuth.js integration

3. **Add Monitoring**
   - Enable Vercel Analytics
   - Set up error tracking (Sentry, LogRocket, etc.)

4. **CORS Configuration**
   - Review and adjust in each `api/**` file
   - Restrict origins in production

5. **Rate Limiting**
   - Implement rate limiting for API endpoints
   - Use Vercel's edge middleware if available

## Rolling Back

If you need to revert to the original Express version:

```bash
# Run the original Express server
npm run start

# Or locally
node src/server.js
```

## Support & Documentation

- [Vercel Docs](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/serverless-functions/introduction)
- [Vercel Edge Middleware](https://vercel.com/docs/edge-middleware/introduction)
- Original App: See `README.md` for feature documentation
