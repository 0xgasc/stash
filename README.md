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
- **Deployment:** Vercel

---

## Project Structure

```
next.config.ts                        # Image optimization for Irys/Arweave domains
app/
├── api/
│   ├── upload/
│   │   ├── irys/route.ts          # Main upload endpoint
│   │   └── check-limit/route.ts   # Check remaining anonymous uploads
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

# Optional -- defaults, overridden by admin panel if KV is linked
MAX_ANONYMOUS_UPLOADS=3
MAX_FILE_SIZE_MB=6144
LINK_EXPIRY_DAYS=14
```

---

## Running Locally

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

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
Client (FormData)
  -> POST /api/upload/irys
  -> Validate file size + rate limit
  -> Create Irys uploader (Ethereum wallet from PRIVATE_KEY)
  -> Check Irys balance
  -> Upload to Irys with metadata tags
  -> [If Supabase] Store in files table + generate claim token
  -> Return { url, claimToken, filename, size }

Client shows URL with copy/open buttons
  -> [If anonymous] "Sign in to claim this file"
  -> OAuth -> /auth/callback?claim_token=...
  -> File associated with user -> visible in /dashboard
```

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

Deployed on Vercel. Push to main or run:

```bash
vercel --prod
```

Env vars must be set in the Vercel dashboard. If using Vercel KV, link a KV store to the project -- `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-injected.

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
| `@irys/upload` + `@irys/upload-ethereum` | Arweave uploads via Irys |
| `@supabase/supabase-js` + `@supabase/ssr` | Auth & database (optional) |
| `@vercel/kv` | Admin settings persistence (optional) |
| `tailwindcss` | Styling |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `zustand` | State management |
