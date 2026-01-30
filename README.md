# Stash

Permanent file storage on the blockchain. Upload a file, get a link. No account required.

Built on [Irys](https://irys.xyz) + [Arweave](https://arweave.org). Currently running on Base Sepolia testnet.

**Live:** [aeter-eight.vercel.app](https://aeter-eight.vercel.app)

---

## How It Works

1. User drops a file on the homepage
2. Server uploads the file to Irys (which stores it on Arweave)
3. User gets a permanent URL
4. Optionally sign in to save the file to a dashboard

Anonymous users get 3 free uploads per session (configurable). After that, they're prompted to create an account.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript + React 19
- **Storage:** Irys devnet -> Arweave blockchain
- **Auth:** Supabase (Google/GitHub OAuth) -- optional, app works without it
- **Admin settings:** Vercel KV (Redis) -- optional, falls back to env vars
- **Styling:** Tailwind CSS + Space Mono font
- **Icons:** Lucide React
- **Upload server:** Express + TUS protocol (separate backend on Railway)
- **Deployment:** Vercel (frontend) + Railway (upload backend)

---

## Project Structure

```
next.config.ts                        # Image optimization for Irys/Arweave domains
app/
├── api/
│   ├── upload/
│   │   ├── check-limit/route.ts   # Check remaining anonymous uploads
│   │   └── increment-limit/route.ts # Increment upload counter after TUS upload
│   ├── admin/
│   │   ├── login/route.ts         # Admin password auth
│   │   ├── logout/route.ts        # Clear admin session
│   │   ├── irys-balance/route.ts  # Wallet & Irys balance
│   │   ├── settings/route.ts      # GET/PUT app settings
│   │   └── reset-limit/route.ts   # Clear rate limit cookie
│   └── auth/
│       └── callback/route.ts      # OAuth callback + file claiming
├── components/
│   ├── NavBar.tsx                  # Auth-aware navigation
│   ├── HomeUploadHero.tsx          # Homepage upload widget (drag & drop)
│   ├── UploadInterface.tsx         # Dedicated upload page widget
│   ├── AuthProvider.tsx            # Supabase auth context
│   ├── AuthModal.tsx               # OAuth sign-in modal
│   ├── PortfolioShowcase.tsx       # Example uploads gallery
│   └── SavingsCalculator.tsx       # Cost comparison calculator
├── lib/
│   ├── admin-auth.ts              # HMAC-signed admin cookies
│   ├── upload-limiter.ts          # HMAC-signed rate limit cookies
│   ├── settings.ts                # KV -> env -> defaults fallback
│   ├── supabase.ts                # Client-side Supabase
│   └── supabase-server.ts         # Server-side Supabase
├── admin/page.tsx                  # Admin dashboard
├── dashboard/page.tsx              # User file dashboard
├── pricing/page.tsx                # Pricing page
├── calculator/page.tsx             # Savings calculator
├── upload/page.tsx                 # Dedicated upload page
├── showcase/page.tsx               # Showcase page
├── page.tsx                        # Homepage
├── layout.tsx                      # Root layout (Space Mono font)
└── globals.css                     # Scanlines, glows, animations
backend/
├── server.js                         # Express + TUS upload server
├── utils/irysUploader.js             # Irys upload logic (file → Arweave)
├── package.json
└── .env                              # Backend env vars (not committed)
```

---

## Environment Variables

```env
# Required
PRIVATE_KEY=<ethereum-private-key-without-0x>
SEPOLIA_RPC=<alchemy-or-infura-sepolia-rpc-url>
ADMIN_PASSWORD=<admin-panel-password>

# Optional -- Supabase (enables auth + dashboard)
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>

# Optional -- Vercel KV (enables editable settings in admin)
KV_REST_API_URL=<vercel-kv-url>
KV_REST_API_TOKEN=<vercel-kv-token>

# Upload backend (separate Express server)
NEXT_PUBLIC_UPLOAD_SERVER=https://your-railway-url.up.railway.app

# Optional -- defaults, overridden by admin panel if KV is linked
MAX_ANONYMOUS_UPLOADS=3
MAX_FILE_SIZE_MB=6144
LINK_EXPIRY_DAYS=14
```

---

## Running Locally

```bash
# Frontend (Next.js)
npm install
npm run dev

# Upload backend (separate terminal)
cd backend
npm install
node server.js
```

Frontend runs on [localhost:3000](http://localhost:3000), upload backend on [localhost:5050](http://localhost:5050).

---

## Admin Panel

Access at `/admin`. Password is whatever you set in `ADMIN_PASSWORD`.

Features:
- **Balances** -- Irys devnet balance (upload budget) and Sepolia wallet balance
- **Settings** -- Edit anonymous upload limit, max file size, link expiry (requires Vercel KV)
- **Upload** -- Upload files with no rate limits
- **Reset limit cookie** -- Clear the anonymous upload counter for your browser

---

## Rate Limiting

Anonymous uploads are tracked with HMAC-signed httpOnly cookies (30-day TTL). The count can't be tampered with client-side because the cookie value includes a signature derived from `ADMIN_PASSWORD`.

Admin users bypass rate limits entirely (checked via the `admin_token` cookie).

---

## Upload Flow

```
Client (tus-js-client, 5MB chunks)
  -> TUS protocol to Express backend (Railway)
  -> Resumable upload with retry
  -> On complete: POST /tus-upload/complete
  -> Backend reads temp file -> uploads to Irys/Arweave
  -> Returns { url, filename, size }
  -> Client calls POST /api/upload/increment-limit (Vercel)
  -> Rate limit cookie incremented

Client shows URL with copy/open buttons
  -> [If anonymous] "Sign in to claim this file"
  -> OAuth -> /auth/callback?claim_token=...
  -> File associated with user -> visible in /dashboard
```

The TUS backend runs separately from Vercel to bypass the 4.5MB serverless body limit. Files of any size (up to 6GB) are uploaded in 5MB chunks with automatic resume on failure.

---

## Auth

Supabase is optional. Without it, the app runs in "demo mode":
- Uploads still work (stored on Irys/Arweave)
- No user accounts, no dashboard
- The "Log in" button in the nav is hidden
- Anonymous upload links are shown once (ephemeral -- stored in React state only)

With Supabase configured:
- Google and GitHub OAuth
- Files tracked in a `files` table
- Dashboard shows all uploaded files with expiry status
- Anonymous uploads can be claimed after signing in

---

## Deployment

**Frontend:** Vercel (auto-deploys from GitHub)
**Upload backend:** Railway (auto-deploys from `backend/` directory)

Vercel env vars: `PRIVATE_KEY`, `SEPOLIA_RPC`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_UPLOAD_SERVER`, and optionally Supabase/KV vars.

Railway env vars: `PRIVATE_KEY`, `SEPOLIA_RPC`, `ALLOWED_ORIGINS`, `PORT`.

If using Vercel KV, link a KV store to the project -- `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-injected.

---

## Wallet

Address: `0x23de198F1520ad386565fc98AEE6abb3Ae5052BE`

Funded with Sepolia ETH, used to pay for Irys devnet uploads. Private key lives in the `PRIVATE_KEY` env var. Never committed to the repo.

---

## Security Notes

- Admin auth uses HMAC-SHA256 signed cookies with 24h TTL
- Rate limit cookies are HMAC-signed to prevent count tampering
- Private key only used server-side for Irys uploads
- File size validated before upload
- `.env.local` is gitignored
- Once uploaded to Arweave, files cannot be deleted

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `next` | Framework (v15) |
| `react` | UI (v19) |
| `tus-js-client` | TUS resumable upload client |
| `@irys/upload` + `@irys/upload-ethereum` | Arweave uploads via Irys |
| `@supabase/supabase-js` + `@supabase/ssr` | Auth & database (optional) |
| `@vercel/kv` | Admin settings persistence (optional) |
| `tailwindcss` | Styling |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `zustand` | State management |
