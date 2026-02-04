# 🚀 Next.js + Vercel - Quick Start

## 5-Minute Setup

### 1. Install & Run
```bash
npm install
npm run dev
```
👉 Opens http://localhost:3000

### 2. Test Flows
- Click on a flow simulator
- Configure your Okta organization
- See OAuth flow in action

### 3. Deploy
```bash
vercel --prod
```
👉 Your app is live on Vercel!

---

## 📁 File Structure

```
pages/
├── api/                 ← API routes (replaced /api)
├── _app.js             ← App wrapper
└── index.js            ← Home page

public/                 ← Static files (CSS, HTML, JS)

src/
├── flows/              ← Flow definitions
├── services/           ← Utility services
└── state/              ← Session management
```

---

## ⚙️ Available Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Build for production |
| `npm run start` | Run production server |
| `npm run lint` | Check code quality |

---

## 🌐 URLs After Deploy

- **Home:** https://your-app.vercel.app
- **OAuth API:** https://your-app.vercel.app/api/oauth/authorize
- **Logs API:** https://your-app.vercel.app/api/logs
- **Well-known:** https://your-app.vercel.app/api/well-known

---

## 📝 API Endpoints

All endpoints at `/api/*`:
- `/oauth/authorize` - OAuth flow
- `/logs` - Get/post/delete logs
- `/configs` - Save/get configs
- `/state` - Manage session state
- `/idps` - Manage IdPs
- `/flows` - Manage flows
- `/settings` - App settings
- `/steps` - Flow steps
- `/sub-functions` - Utility functions

---

## ✅ What Works

✅ All 6 OAuth flows  
✅ All features from original app  
✅ Setup wizard  
✅ IDP management  
✅ Logging  
✅ JWT inspection  
✅ cURL commands  
✅ QR codes  

---

## 🔐 Environment Setup

Create `.env.local`:
```
VERCEL_ENV=development
```

For production (Vercel dashboard):
- Settings → Environment Variables → Add variables

---

## 🚀 Deploy Now

### Option 1: Vercel CLI (1 command)
```bash
vercel --prod
```

### Option 2: Git Auto-Deploy
1. Push to GitHub/GitLab/Bitbucket
2. Connect at vercel.com
3. Auto-deploy on push!

---

## 🆘 Troubleshooting

**Module not found?**
```bash
npm install
```

**Dev server not starting?**
```bash
rm -rf .next
npm run dev
```

**API returning 404?**
- Check file is in `pages/api/`
- Check filename matches route

**Styles not loading?**
- CSS imported in `pages/_app.js`
- Check public/ has styles.css

---

## 📚 Learn More

- **Next.js:** https://nextjs.org/docs
- **Vercel:** https://vercel.com/docs
- **React:** https://react.dev

---

## ✨ Feature Highlights

- 🎯 **Full-Featured** - Complete Next.js framework
- ⚡ **Fast** - Automatic optimization
- 🚀 **Scalable** - Auto-scales on Vercel
- 💰 **Free** - Generous free tier
- 🔒 **Secure** - HTTPS automatic
- 📊 **Analytics** - Built-in analytics

---

**Status:** ✅ Ready for production  
**Deployment:** Vercel  
**Framework:** Next.js 14  
**Version:** 2.0.0  

🎉 **You're all set! Deploy now: `vercel --prod`**
