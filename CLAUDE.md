# Stash (Aeter)

Permanent file storage on Arweave via Irys. Upload anything, get an indestructible URL. Express backend on Railway, Next.js frontend on Vercel.

## Architecture

```
Browser → Next.js (Vercel)  → Express backend (Railway) → SQLite (Railway volume)
                             ↘ TUS resumable uploads     → Irys → Arweave (permanent)
                             ↘ Stripe/Recurrente/StablePay webhooks
```

- **Frontend**: Next.js App Router, deployed on Vercel as project `aeter`
- **Backend**: Express + better-sqlite3, deployed on Railway as service `stash`
- **Storage**: Arweave via Irys SDK (permanent, blockchain-based)
- **Auth**: Own magic-link system via Resend (not Supabase)
- **Payments**: Stripe (cards), Recurrente (GT/LATAM), StablePay widget v3 (crypto/USDC)

Frontend never touches SQLite directly. All data flows through `backendJson()` / `backendFetch()` in `app/lib/backend.ts`, authenticated via `X-Admin-Secret` header (server-to-server only).

## URLs

| Environment | Frontend | Backend |
|---|---|---|
| Production | https://stash.offsetworks.xyz (pending CNAME) / https://aeter-eight.vercel.app | https://stash-production-47fc.up.railway.app |
| Local | http://localhost:3000 | http://localhost:5050 |

GitHub: https://github.com/0xgasc/stash.git

## Database

SQLite on Railway volume. Migrations are auto-applied on startup in `backend/db.js`.

| Version | What |
|---|---|
| v1-v4 | Core uploads, upload_links, geo, cron_runs, api_keys |
| v5 | Users, folders, tags, upload_folders, upload_tags, reserved_handles |
| v6 | Plans, user_plans, pre-claim user flow, plan seeding (Drift/Signal/Beacon/Archive) |
| v7 | User email, preferred_locale, handle_changed_at |
| v8 | daily_upload_limit on plans (Drift = 3/day) |
| v9 | Folder privacy: password_hash, access_mode, folder_access table, feature gating |
| v10 | Stripe price IDs on plans |

### Key tables

- `uploads` — every file ever uploaded (uuid, irys_url, arweave_id, user_id, visibility)
- `users` — accounts (id, handle, email, display_name, is_admin, theme prefs)
- `folders` — user-created collections (slug, visibility, accent, access_mode, password_hash)
- `plans` — 4 tiers: Drift (free), Signal ($9/mo), Beacon ($29/mo), Archive ($299 lifetime)
- `user_plans` — subscription state (status, payment_provider, payment_reference, ends_at)
- `folder_access` — email whitelist per folder (for email-restricted sharing)

## Backend Routes

All Express routes are in `backend/routes/`:

| File | Mount | Purpose |
|---|---|---|
| `api.js` | `/api/v1` | Programmatic uploads, API keys, stats, bulk ops, fund-irys |
| `users.js` | `/api/v1/users` | Bootstrap, handle claim, profile, plans list, `/me` endpoint |
| `me.js` | `/api/v1/me` | Folder CRUD, file management, upload listing, folder privacy |
| `public.js` | `/api/v1/u` | Public profiles, folder pages, access control enforcement |
| `admin.js` | `/api/v1/admin` | Admin panel APIs, user management, plan assignment |
| `checkout.js` | `/api/v1/checkout` | Stripe/Recurrente checkout session creation, StablePay confirmation |
| `webhooks.js` | `/api/v1/webhook` | Stripe/Recurrente/StablePay payment webhook handlers |

## Frontend Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Home — upload dropzone (HomeUploadHero) |
| `/auth` | `app/auth/page.tsx` | Magic link login |
| `/me` | `app/me/page.tsx` | Dashboard — plan usage, folders, uploads |
| `/me/setup` | `app/me/setup/page.tsx` | Handle picker (first login) |
| `/me/settings` | `app/me/settings/page.tsx` | Profile settings |
| `/me/folders/[id]` | `app/me/folders/[id]/page.tsx` | Folder editor (files, privacy, settings) |
| `/pricing` | `app/pricing/page.tsx` | Plan cards, comparison table, FAQ |
| `/checkout/[planSlug]` | `app/checkout/[planSlug]/page.tsx` | Payment method picker (Stripe/Recurrente/crypto) |
| `/checkout/success` | `app/checkout/success/page.tsx` | Post-payment confirmation |
| `/about` | `app/about/page.tsx` | Why permanent storage beats cloud |
| `/u/[handle]` | `app/u/[handle]/page.tsx` | Public profile + folder grid |
| `/u/[handle]/f/[slug]` | `app/u/[handle]/f/[slug]/page.tsx` | Public folder page with access control |
| `/claim` | `app/claim/page.tsx` | Pre-claim account activation |
| `/admin` | `app/admin/page.tsx` | Admin dashboard |

## Key Components

| Component | Purpose |
|---|---|
| `HomeUploadHero` | Drag-drop upload with TUS, anon/logged-in limits, folder picker |
| `FolderEditor` | Full folder management — files, settings, privacy (password/email) |
| `FolderAccessGate` | Password form + sign-in prompt for protected folders |
| `CheckoutButtons` | Stripe/Recurrente redirect + StablePay widget inline |
| `StablePayWidget` | Loads wetakestables.shop widget v3, merchant ID `cmn979jnf0000110ntpw8x6fi` |
| `AuthModal` | Magic link sign-up/sign-in overlay |
| `FolderListClient` | Folder grid with create/delete |
| `NavBar` | Top nav with About/Pricing/Sign in links |

## Payment System

### Flow

1. User visits `/pricing` → clicks paid plan CTA → `/checkout/[slug]` (requires login)
2. Picks payment method:
   - **Stripe**: Creates Checkout Session → redirect to Stripe → webhook confirms → `assignPlan()`
   - **Recurrente**: Redirects to Recurrente checkout URL with metadata → webhook confirms
   - **StablePay**: Widget renders inline → user pays USDC on-chain → client confirms → `assignPlan()`
3. Webhook/confirmation calls `assignPlan()` → sets `ends_at` based on billing period
4. User lands on `/checkout/success`

### Plan feature gating

Plans have a `features_json` column with boolean flags. Backend checks via `requireFeature(userId, feature)` in `me.js`. Currently gated features:
- `password_lock` — folder password protection (Signal+)
- `email_sharing` — email-restricted folder access (Signal+)

### Subscription expiry

`getActiveUserPlan()` in `db.js` auto-expires plans past `ends_at` (sets status to 'expired', returns null). Monthly plans get 30 days, yearly get 1 year, one-time (Archive) gets null (lifetime).

### Webhook endpoints

| Provider | URL | Signature verification |
|---|---|---|
| Stripe | `/api/v1/webhook/stripe` | `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` |
| Recurrente | `/api/v1/webhook/recurrente` | HMAC-SHA256 of body with `RECURRENTE_SECRET_KEY` |
| StablePay | `/api/v1/webhook/stablepay` | HMAC-SHA256 of body with `STABLEPAY_WEBHOOK_SECRET` |

### Stripe events handled

- `checkout.session.completed` — activates plan
- `invoice.paid` — renews subscription
- `customer.subscription.deleted` — auto-downgrades to Drift (free)

## Folder Access Control

Folders support 4 access modes: `open`, `password`, `email`, `password_email`.

- Password: scrypt-hashed, stored in `folders.password_hash`. Verified server-side.
- Email: whitelist in `folder_access` table. Viewer's email comes from their session.
- Password is sent via httpOnly cookie (`stash_fpw_<handle>_<slug>`), never in URL query params.
- Unlock flow: client POSTs to `/api/u/[handle]/f/[slug]/unlock` → validates → sets cookie → `router.refresh()`.

## Auth

Own magic-link system (not Supabase):
- `POST /api/auth/request` — sends magic link via Resend
- `GET /api/auth/verify?token=...` — validates token, sets session cookie
- Session: signed httpOnly cookie with user ID
- `requireUser()` in `app/lib/auth.ts` — verifies session, loads SQLite user row
- Admin: HMAC cookie OR `users.is_admin` flag

## Onboarding Funnel

1. Anonymous: 1 free upload (tracked via HMAC-signed cookie), then sign-up prompt
2. Free account (Drift): 3 uploads/day, 10/month, organize in folders
3. Paid tiers: higher limits + premium features (password lock, email sharing, etc.)

Upload limits enforced both client-side (pre-check) and server-side (backend rejects).

## i18n

EN + ES dictionaries in `app/lib/i18n/dict.ts`. Server: `getServerT(locale)`. Client: `useI18n()` hook. Locale stored in cookie, switchable via `LangSwitcher` component.

## Environment Variables

### Backend (Railway)

| Var | Required | Purpose |
|---|---|---|
| `PRIVATE_KEY` | Yes | Irys/Arweave wallet key |
| `SEPOLIA_RPC` | Yes | Ethereum RPC for Irys |
| `ADMIN_BACKEND_SECRET` | Yes | Server-to-server auth from Next.js |
| `ALLOWED_ORIGINS` | Yes | CORS origins |
| `FRONTEND_URL` | Yes | Checkout redirect base URL |
| `STRIPE_SECRET_KEY` | For Stripe | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | For Stripe | Webhook signature verification |
| `RECURRENTE_SECRET_KEY` | For Recurrente | Webhook signature verification |
| `STABLEPAY_WEBHOOK_SECRET` | For StablePay | Webhook signature (optional, widget-based) |
| `RESEND_API_KEY` | Yes | Magic link emails |
| `ALERT_FROM` | No | Alert email sender (default: alerts@offsetworks.xyz) |
| `ALERT_TO` | No | Alert email recipient |

### Frontend (Vercel)

| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_UPLOAD_SERVER` | Yes | Backend URL for TUS + API |
| `ADMIN_BACKEND_SECRET` | Yes | Same as backend, for server-to-server calls |

## Dev

```bash
# Backend
cd backend && npm install && node server.js
# → http://localhost:5050

# Frontend
npm install && npm run dev
# → http://localhost:3000
```

## Deployment

Both auto-deploy from `main` branch:
- **Vercel**: watches GitHub repo, builds Next.js
- **Railway**: watches GitHub repo, runs `node backend/server.js`

```bash
git add -A && git commit -m "..." && git push origin main
```

## Pending Setup

- [ ] Add CNAME `stash` → `cname.vercel-dns.com` at DNS for offsetworks.xyz
- [ ] Add `stash.offsetworks.xyz` as custom domain in Vercel project settings
- [ ] Rotate Stripe secret key (leaked in chat 2026-05-28), set new one on Railway
- [ ] Rotate Recurrente keys (leaked in chat 2026-05-28)
- [ ] Set up Recurrente products + webhook + paste checkout URLs in admin panel
- [ ] Test full payment flow end-to-end (Stripe → webhook → plan activation)
