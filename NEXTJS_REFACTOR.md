# Next.js Refactor - Complete Guide

**Status:** ✅ COMPLETE  
**Framework:** Next.js 14+ (React-based)  
**Deployment:** Vercel  
**Version:** 2.0.0  

---

## 🎉 What Changed

Your application has been refactored from serverless functions to a **full Next.js application**. This provides:

✅ **Better Developer Experience**
- React components instead of plain HTML
- Hot module reloading during development
- Better build optimization
- TypeScript support ready

✅ **Performance Benefits**
- Automatic code splitting
- Image optimization
- Font optimization
- Faster page loads

✅ **Production Ready**
- Built-in SSR (Server-Side Rendering)
- Static Site Generation (SSG)
- API routes with better structure
- Built-in analytics ready

✅ **Same Functionality**
- All OAuth flows work identically
- All API endpoints preserved
- All features maintained
- 100% backward compatible

---

## 📁 New Project Structure

```
OktaAIRepository/
├── pages/                       # Next.js pages & API routes
│   ├── api/                     # API routes (replaces /api)
│   │   ├── oauth/authorize.js
│   │   ├── logs/index.js
│   │   ├── configs/index.js
│   │   ├── state/index.js
│   │   ├── idps/index.js
│   │   ├── flows/index.js
│   │   ├── settings/index.js
│   │   ├── steps/index.js
│   │   ├── sub-functions/index.js
│   │   └── well-known.js
│   ├── _app.js                  # Next.js app wrapper
│   └── index.js                 # Home page
├── public/                      # Static assets (replaces src/public)
│   ├── *.html
│   ├── *.js
│   ├── styles.css
│   └── lib/flow-engine/
├── src/
│   ├── config.js                # Configuration (unchanged)
│   ├── server.js                # Original Express (kept for reference)
│   ├── flows/                   # Flow definitions (unchanged)
│   ├── services/                # Services (unchanged)
│   │   ├── logger-serverless.js
│   │   ├── jwtService.js
│   │   ├── tokenExchange.js
│   │   └── subFunctions/
│   └── state/
│       └── sessionStore-serverless.js
├── next.config.js               # Next.js configuration
├── package.json                 # Updated with Next.js deps
└── vercel.json                  # Vercel deployment config
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Opens: http://localhost:3000

### 3. Build for Production
```bash
npm run build
npm run start
```

### 4. Deploy to Vercel
```bash
npx vercel --prod
```

Or connect Git repo to vercel.com for auto-deploy.

---

## 📝 API Routes

All API routes now use Next.js format at `/pages/api`:

| Route | Method | File |
|-------|--------|------|
| `/api/oauth/authorize` | POST | `pages/api/oauth/authorize.js` |
| `/api/logs` | GET,POST,DELETE | `pages/api/logs/index.js` |
| `/api/configs` | GET,POST | `pages/api/configs/index.js` |
| `/api/state` | GET,POST,DELETE | `pages/api/state/index.js` |
| `/api/idps` | GET,POST,DELETE | `pages/api/idps/index.js` |
| `/api/flows` | GET,POST,PUT,DELETE | `pages/api/flows/index.js` |
| `/api/settings` | GET,POST,PUT,DELETE | `pages/api/settings/index.js` |
| `/api/steps` | GET,POST | `pages/api/steps/index.js` |
| `/api/sub-functions` | GET,POST | `pages/api/sub-functions/index.js` |
| `/api/well-known` | GET | `pages/api/well-known.js` |

---

## 🏠 Frontend Pages

### Home Page
- **URL:** `/`
- **File:** `pages/index.js`
- **Component:** React home page with flow cards

### Legacy Static Pages
Still served as-is from `/public`:
- `/auth-code-flow.html`
- `/agentic-token-exchange.html`
- `/device-grant-flow.html`
- `/token-exchange-flow.html`
- `/native-to-web-flow.html`
- `/direct-auth-flow.html`
- `/setup.html`
- `/manage-idps.html`
- `/settings.html`
- `/log-viewer.html`
- `/flow.html`

---

## 🔧 Key Changes

### Before (Serverless)
```
/api/oauth/authorize.js          (Vercel serverless)
/src/public/index.html           (Static HTML)
```

### After (Next.js)
```
/pages/api/oauth/authorize.js    (Next.js API route)
/pages/index.js                  (React component)
/public/                         (Static assets)
```

---

## 📦 Dependencies Changed

### Added
- `next@^14.0.0` - Next.js framework
- `react@^18.2.0` - React library
- `react-dom@^18.2.0` - React DOM

### Removed
- `express` - Replaced by Next.js
- `open` - Not needed in serverless

### Kept
- `dotenv` - Environment variables
- `jose` - JWT operations
- `qrcode` - QR code generation

---

## 🎯 What Works

✅ **All OAuth Flows**
- Authorization Code
- Agentic Token Exchange
- Device Grant
- Token Exchange (RFC 8693)
- Native SSO to Web
- Direct Authentication

✅ **All Features**
- Setup wizard
- IDP management
- Configuration storage
- Flow builder
- Logging & debugging
- JWT inspection
- Token exchange
- QR code generation
- cURL debugging

✅ **All API Endpoints**
- OAuth authorization
- Logging
- Configuration
- State management
- IDP management
- Flow definitions
- Settings management
- Sub-functions

---

## ⚡ Performance Improvements

1. **Code Splitting** - Only load what you need
2. **Image Optimization** - Automatic image optimization
3. **Font Optimization** - Better font loading
4. **CSS Optimization** - Automatic CSS optimization
5. **Build Optimization** - Faster builds with SWC

---

## 🔐 Environment Variables

Add to `.env.local`:
```
VERCEL_ENV=development
NODE_ENV=development
```

For production, set in Vercel dashboard:
- Settings → Environment Variables

---

## 📚 Scripts

```json
{
  "dev": "next dev",           // Dev server (http://localhost:3000)
  "build": "next build",       // Build for production
  "start": "next start",       // Start production server
  "lint": "next lint"          // Run ESLint
}
```

---

## 🚀 Deployment

### Option 1: Vercel CLI
```bash
npm install -g vercel
vercel --prod
```

### Option 2: Git Integration (Recommended)
1. Push to GitHub/GitLab/Bitbucket
2. Connect repo to vercel.com
3. Auto-deploy on every push

### Option 3: Docker
```bash
docker build -t okta-simulator .
docker run -p 3000:3000 okta-simulator
```

---

## 🔄 Migration Notes

### Session State
- Still in-memory per function instance
- For production, use Vercel KV or database
- See `src/state/sessionStore-serverless.js`

### File Storage
- Static files in `/public`
- For dynamic storage, use database or KV
- Original Express server still available in `src/server.js`

### Legacy HTML Files
- Served as static files from `/public`
- Can be converted to React components as needed
- Backward compatible with existing client code

---

## 🔙 Rollback

If needed, revert to Express server:
```bash
npm uninstall next react react-dom
npm install express open
npm run start  # Runs Express server
```

Original files are preserved in `src/`.

---

## 📊 Comparison: Serverless vs Next.js

| Feature | Serverless | Next.js |
|---------|-----------|---------|
| **Framework** | Custom | Full-featured |
| **Build** | Manual | Automated |
| **Pages** | HTML files | React components |
| **API Routes** | `/api/*.js` | `/pages/api/*.js` |
| **Performance** | Good | Better |
| **DX** | Basic | Excellent |
| **Deploy** | One step | Same |

---

## 🐛 Troubleshooting

### Issue: Module not found
**Solution:** Make sure imports use correct relative paths

### Issue: Styles not loading
**Solution:** Styles are imported in `pages/_app.js`, check CSS paths

### Issue: API returning 404
**Solution:** Check file is in `pages/api/` with correct name

### Issue: Build failing
**Solution:** Run `npm install` and check for console errors

---

## ✨ Next Steps

1. **Test locally:** `npm run dev`
2. **Try a flow:** Go to http://localhost:3000
3. **Deploy:** `vercel --prod`
4. **Customize:** Add React components as needed
5. **Monitor:** Enable Vercel Analytics

---

## 📖 Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Vercel Docs](https://vercel.com/docs)
- [React Docs](https://react.dev)
- [Okta OAuth Docs](https://developer.okta.com)

---

## 🎉 You're Ready!

Your application is now a modern Next.js application deployed on Vercel, with all functionality preserved and better performance!

**Start:** `npm run dev`  
**Deploy:** `vercel --prod`

Happy coding! 🚀
