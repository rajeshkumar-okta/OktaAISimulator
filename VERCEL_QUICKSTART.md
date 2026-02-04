# Vercel Quick Start Guide

## 5-Minute Deployment

### Step 1: Prepare Your Repository
```bash
# Commit all changes
git add .
git commit -m "Convert to Vercel serverless deployment"
git push origin main
```

### Step 2: Deploy to Vercel
```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Deploy
vercel --prod
```

**Or** connect your Git repository to [vercel.com](https://vercel.com) for automatic deployments.

### Step 3: Set Environment Variables
In Vercel Dashboard → Project Settings → Environment Variables:
```
NODE_ENV = production
```

## Testing Locally

```bash
# Install dependencies
npm install

# Run Vercel dev server locally
npm run vercel-dev

# Open http://localhost:3000
```

## API Endpoints

All endpoints are now serverless functions:

| Endpoint | Method | File |
|----------|--------|------|
| `/api/.well-known` | GET | `api/well-known.js` |
| `/api/oauth/authorize` | POST | `api/oauth/authorize.js` |
| `/api/logs` | GET, POST, DELETE | `api/logs/index.js` |
| `/api/configs` | GET, POST | `api/configs/index.js` |
| `/api/state` | GET, POST, DELETE | `api/state/index.js` |
| `/api/idps` | GET, POST, DELETE | `api/idps/index.js` |

## Static Files

All files in `src/public/` are served as static assets:
- `src/public/index.html` → `/index.html`
- `src/public/setup.html` → `/setup.html`
- `src/public/auth-code-flow.html` → `/auth-code-flow.html`
- etc.

## Key Differences from Express

| Feature | Express Version | Vercel Version |
|---------|-----------------|----------------|
| Server | Traditional Express.js | Serverless Functions |
| State Storage | In-memory (dies with server) | Per-function instance (ephemeral) |
| File Persistence | Local filesystem | /tmp (ephemeral) or KV store |
| Session Management | Simple in-memory | Need database or KV |
| Cold Starts | N/A | ~1-2 seconds |
| Scaling | Manual | Automatic |

## Production Improvements

For production, implement persistent storage:

### Option 1: Vercel KV (Recommended for small projects)
```bash
vercel env pull
```
Then use KV in your functions.

### Option 2: Database (PostgreSQL, MongoDB, etc.)
Connect your favorite database and update the handlers.

### Option 3: Browser Storage + Session IDs
Store state on client side and pass session ID in URLs.

## Troubleshooting

**Q: State is lost between requests**
A: This is expected on serverless. Use client-side storage or a database.

**Q: Getting CORS errors**
A: CORS headers are set in each API handler. Adjust origins as needed.

**Q: Function timeout**
A: Check function duration in `vercel.json`. Increase `maxDuration` if needed.

**Q: Cannot read file from disk**
A: Vercel is read-only except for `/tmp`. Use KV or database for data.

## Next Steps

1. Review [VERCEL_MIGRATION.md](./VERCEL_MIGRATION.md) for detailed migration info
2. Set up persistent storage (KV or database)
3. Implement proper session management
4. Add monitoring and error tracking
5. Test all flows before production release

## Rollback

To revert to traditional Express server:
```bash
npm run start
```

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Serverless Functions Guide](https://vercel.com/docs/serverless-functions/introduction)
- Original App README: See [README.md](./README.md)
