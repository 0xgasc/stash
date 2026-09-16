# Stash Handover

Permanent file storage on Arweave via Irys. Upload anything, get an indestructible URL. Runs **entirely on free infrastructure** — Sepolia testnet ETH funds uploads to Irys devnet, Railway volume holds durable originals.

> **Core constraint:** Stash must never cost real money to operate. No mainnet, no paid storage. Engineered around devnet eviction (~60-day data lifetime) by keeping originals on disk and re-uploading on a 20-day cycle.

## Architecture

```
Browser → Next.js (Vercel) → Express backend (Railway) → SQLite (Railway volume)
                            ↘ TUS resumable uploads    → Irys SDK → Arweave devnet
                            ↘ Stripe / Recurrente / StablePay webhooks
```

| Layer     | Stack                        | Deployed On |
|-----------|------------------------------|-------------|
| Frontend  | Next.js 15, React 19, TS     | Vercel      |
| Backend   | Express, better-sqlite3      | Railway     |
| Database  | SQLite (v14, 14 migrations)  | Railway volume (`/data/stash.db`) |
| Storage   | Irys devnet + Railway volume | Arweave (temporary) + disk (durable) |
| Auth      | Own magic-link via Resend    | — |
| Payments  | Stripe, Recurrente, StablePay | Webhooks |
| Video     | ffmpeg faststart remux       | Railway |

## URLs

| Environment | Frontend | Backend |
|-------------|----------|---------|
| Production  | `aeter-eight.vercel.app` (pending CNAME: `stash.offsetworks.xyz`) | `stash-production-47fc.up.railway.app` |
| Local       | `localhost:3000` | `localhost:5050` |

GitHub: `github.com/0xgasc/stash`

Both auto-deploy from `main` branch. Push = deploy.

## Project Structure

```
aeter/
├── app/                    # Next.js App Router frontend (TypeScript)
│   ├── admin/              # Admin dashboard
│   ├── api/                # Next.js API routes (auth, checkout, uploads)
│   ├── components/         # React components (HomeUploadHero, FolderEditor, etc.)
│   ├── lib/                # backend.ts, auth.ts, i18n/
│   ├── u/[handle]/         # Public profiles & folders
│   └── me/                 # User dashboard, settings, folders
├── backend/                # Express backend (CommonJS)
│   ├── cron/               # 4 cron jobs (see Cron Jobs section)
│   ├── routes/             # 7 route modules (see Backend Routes)
│   ├── utils/              # 9 utility modules (see Utils)
│   ├── middleware/          # apiAuth.js — API key + admin secret verification
│   ├── scripts/            # fund-irys.js, check-fund-tx.js
│   ├── test/               # Vitest tests (plans, quota, sanitize, webhooks)
│   ├── server.js           # Entry point (622 lines)
│   ├── db.js               # Schema + all DB operations (1678 lines, 14 migrations)
│   ├── Dockerfile          # node:20-slim + ffmpeg
│   └── railway.json        # Deploy config
├── CLAUDE.md               # Authoritative project documentation
└── HANDOVER.md             # This file
```

## How Devnet Works

This is the most important thing to understand about Stash.

### The Problem

Irys devnet stores files on Arweave for free using Sepolia (testnet) ETH. But devnet is **not permanent** — data is evicted after approximately **61–66 days** (measured empirically, hard cliff). After eviction, the gateway returns an HTML error page with a **200 status code**, not a 404.

This is critical: naive health checks that only look at HTTP status will think evicted files are fine.

### The Solution

Three layers prevent data loss:

1. **Volume originals** — Every upload is saved to `/data/originals/<uuid>` via `preserveOriginal()`. This is the source of truth. Devnet is the free CDN.
2. **Refresh cron** (`cron/refreshDevnet.js`) — Every 6 hours, files older than 20 days are re-uploaded to devnet from the volume copy. Resets the eviction clock well before the ~60-day cliff.
3. **Verify sweep** (`cron/verifyDevnet.js`) — Daily, a one-byte Range request probes every live devnet copy. If the reported file size doesn't match `uploads.size`, it repairs immediately from the volume copy.

### The Only Reliable Integrity Signal

**Byte count.** Content-Type lies (evicted files still serve the original content-type). HTTP status lies (200 for HTML error pages). Only comparing the `Content-Range` total against the stored `uploads.size` catches corruption.

## The 143-File Incident (2026-09-06)

**143 of 746 files destroyed — 2.57 GB lost, unrecoverable.** Discovered and fixed 2026-09-06.

### What Happened

The refresh cron's `reuploadFromExisting()` fetched files from the gateway to re-upload them. When a file was already evicted, the gateway returned its Nuxt HTML app shell (~4904 bytes) with HTTP 200. The cron uploaded that HTML as the new file, overwrote `uploads.irys_url`, and reported success. Every subsequent refresh cycle re-uploaded the HTML again.

### Why Unrecoverable

These files were uploaded before originals were saved to the volume (feature shipped 2026-06-11). The only copy was on devnet, and once the cron overwrote the URL with the HTML version, the original transaction ID was lost. Prior transactions 404 on every gateway.

### What Was Fixed

- Refresh cron now prefers volume originals; gateway fetch validates byte count against `uploads.size`
- Verify sweep (new) catches corruption within 24 hours
- Every upload since 2026-06-11 has a volume original — this failure class is now impossible for new files
- 2026-09-16: the accounting stopped lying about the survivors. `getBackfillStats()` and `getUploadsWithoutOriginals()` in `db.js` used to ask only "does a file exist?", so the 143 uuids whose volume copy is the gateway's 4904-byte HTML shell counted as healthy and the backfill cron never re-attempted them. Both now go through `getValidOriginalPath(uuid, size)` in `utils/originals.js`, which compares the byte count. `GET /api/v1/admin/backfill` reports them as `corrupt` instead of `withOriginal`, the backfill cron re-attempts them and marks each `backfill_skipped`, and `/f/:uuid` answers 410 instead of 200 + HTML.

Before that fix the endpoint said `{withOriginal: 920, missing: 0, skipped: 1}` when
the truth was 777 intact and 143 lost. **Byte count is the only integrity signal —
in the serving path, the repair path, and the bookkeeping.**

### Affected Sources

flyin-batch-helitours 68, koh-gallery 35, koh-hero-video 9, koh-product-video 9, web 7, flyin-admin 6, koh-recompress 3, pez 3, koh 2, koh-product 1.

## Cron Jobs

All four start automatically on boot in `server.js`. Each has a `*_CRON_DISABLED=1` env var to disable, and logs every run to the `cron_runs` table.

### 1. Refresh (`cron/refreshDevnet.js`)

- **Interval:** 6 hours (first run after 5 min)
- **Max per run:** 50 (`REFRESH_MAX_PER_RUN`)
- **Disable:** `REFRESH_CRON_DISABLED=1`
- **What:** Re-uploads files older than 20 days (`REFRESH_AFTER_DAYS`) to devnet from volume original. Rewrites `uploads.irys_url` in place, writes new `upload_links` row. Stops early if Irys balance exhausted.

### 2. Backfill (`cron/reuploadStale.js`)

- **Interval:** 6 hours (first run after 2 min)
- **Max per run:** 50 (`REUPLOAD_MAX_PER_RUN`)
- **Disable:** `REUPLOAD_CRON_DISABLED=1`
- **What:** Downloads missing volume originals from gateway. Validates byte count against `uploads.size`. Marks unrecoverable files as `backfill_skipped`. Also retries any file whose *existing* local copy fails the byte check (existence is not proof) — a failed retry marks the row `backfill_skipped`, so the `corrupt` count in `GET /api/v1/admin/backfill` drains over ~3 runs at the default 50/run.

### 3. Verify (`cron/verifyDevnet.js`)

- **Interval:** 24 hours (first run after 10 min)
- **Max repairs per run:** 50 (`VERIFY_REPAIR_MAX_PER_RUN`)
- **Disable:** `VERIFY_CRON_DISABLED=1`
- **What:** Probes every live devnet copy with `Range: bytes=0-0` (8 concurrent). Compares `Content-Range` total to `uploads.size`. Repairs mismatches from volume original. Sends alert email with repair summary.

### 4. Alerts (`cron/alerts.js`)

- **Interval:** 1 hour (first run after 90s)
- **Disable:** `ALERT_CRON_DISABLED=1`
- **What:** Three checks:
  1. Sepolia wallet balance below `SEPOLIA_LOW_THRESHOLD` (default 0.1 ETH) → alert email
  2. Irys devnet balance below `IRYS_LOW_THRESHOLD` (default 0.005 ETH) → auto-funds from Sepolia (`IRYS_AUTO_FUND_AMOUNT`, default 0.1 ETH) with 6h cooldown
  3. Last cron run with status `crashed` → alert email

### Refresh Cycle Cost

A full cycle (all files re-uploaded once) costs approximately **0.349 ETH** on Sepolia/devnet:
- ~806 non-UMO files: ~0.145 ETH
- ~112 UMO files (larger, video): ~0.204 ETH

This is testnet ETH — free from faucets. Cycle repeats every 20 days.

## Database

SQLite via `better-sqlite3`, stored on Railway volume. Migrations auto-apply on boot inside transactions. File-copy backup taken before pending migrations (last 5 kept in `data/backups/`). WAL mode, foreign keys ON.

### Migrations

| Version | What |
|---------|------|
| v1-v4   | Core uploads, upload_links, geo, cron_runs, api_keys |
| v5      | Users, folders, tags, upload_folders, upload_tags, reserved_handles |
| v6      | Plans, user_plans, pre-claim user flow, plan seeding (Drift/Signal/Beacon/Archive) |
| v7      | User email, preferred_locale, handle_changed_at |
| v8      | daily_upload_limit on plans (Drift = 3/day) |
| v9      | Folder privacy: password_hash, access_mode, folder_access table |
| v10     | Stripe price IDs on plans |
| v11     | Payment idempotency: unique index on (payment_provider, payment_reference) |
| v12     | backfill_skipped flag for unrecoverable uploads |
| v13     | stream_url column for web-optimized video |
| v14     | refresh_skipped flag to opt files out of devnet refresh |

### Key Tables

**`uploads`** — Every file ever uploaded.
- `uuid` (unique), `source`, `filename`, `content_type`, `size`
- `irys_url` (current devnet URL, rewritten on refresh), `arweave_id`, `ar_url`
- `user_id`, `visibility` (public/unlisted/private), `title`, `caption`
- `reupload_count`, `last_reuploaded_at`
- `refresh_skipped` (opt out of refresh), `backfill_skipped` (unrecoverable)
- `stream_url` (optimized video URL)

**`upload_links`** — History of every re-upload (audit trail).
- `upload_uuid`, `irys_url`, `arweave_id`, `reason`, `price_wei`, `created_at`

**`users`** — Accounts (magic-link auth).
- `id`, `handle` (unique, NOCASE), `email`, `display_name`, `is_admin`
- `claim_token`, `claimed_at`, `created_by_admin`

**`folders`** — User-created collections.
- `user_id`, `slug`, `name`, `visibility`, `access_mode` (open/password/email/password_email)
- `password_hash` (scrypt), `banner_uuid`

**`plans`** — 4 tiers.
- Drift (free, 3/day, 10/month), Signal ($9/mo, 100/month), Beacon ($29/mo, 500/month), Archive ($299 lifetime, unlimited)
- `features_json` for boolean feature flags (`password_lock`, `email_sharing`)

**`user_plans`** — Subscription state.
- `status` (pending/active/paused/cancelled/expired), `payment_status`, `payment_provider`
- `payment_reference`, `ends_at` (auto-expired on read by `getActiveUserPlan()`)
- Unique index on `(payment_provider, payment_reference)` for idempotency

**`api_keys`** — External API keys, stored as SHA-256 hashes.

**`cron_runs`** — Audit log of every cron execution.

**`folder_access`** — Email whitelist per folder (for email-restricted sharing).

## Backend Routes

### In `server.js` (not in route files)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /tus-upload` | Rate limit (20/hr, API key holders bypass) | TUS resumable upload, 6GB max |
| `POST /tus-upload/complete` | Rate limit | Triggers Irys upload, quota check, DB insert, video optimize |
| `GET /f/:uuid` | None | Serves optimized → original → gateway 302 (with Range support) |
| `GET /f/:uuid/raw` | None | Same but prefers faststart remux |
| `GET /f/:uuid/original` | None | Exact uploaded bytes, never remuxed |
| `GET /f/:uuid/meta` | None | JSON metadata |
| `GET /health` | None | Health check |

### Route files in `backend/routes/`

| Mount | File | Auth | Purpose |
|-------|------|------|---------|
| `/api/v1` | `api.js` | API key | Programmatic uploads, stats, bulk ops, fund-irys |
| `/api/v1/users` | `users.js` | Admin secret | Bootstrap, claim, profile, plans list |
| `/api/v1/me` | `me.js` | Admin secret + user context | Folder CRUD, file management, upload listing |
| `/api/v1/u` | `public.js` | None | Public profiles, folder pages, access control |
| `/api/v1/admin` | `admin.js` | Admin secret | Admin panel, user/plan management, import-url, refresh triggers |
| `/api/v1/checkout` | `checkout.js` | Admin secret | Stripe/Recurrente/StablePay checkout session creation |
| `/api/v1/webhook` | `webhooks.js` | Signature verification | Payment webhook handlers |

### Key Admin Endpoints

| Endpoint | What |
|----------|------|
| `POST /api/v1/admin/import-url` | Adopt gateway-hosted file: downloads bytes, verifies size, saves to volume, registers in DB. Refuses URL-only registration. |
| `POST /api/v1/admin/refresh` | Trigger refresh cron manually |
| `GET /api/v1/admin/refresh` | Check how many files are past refresh threshold |
| `PATCH /api/v1/admin/uploads/:uuid` | Update upload metadata (content_type, title, visibility, refresh_skipped) |
| `POST /api/v1/admin/uploads/bulk-skip-refresh` | Mark multiple uploads to skip refresh |
| `POST /api/v1/admin/migrate-gateway` | Bulk swap gateway domain in all irys_url values |

### Auth Model

- Frontend → backend: `X-Admin-Secret` header (server-to-server only, set in both Vercel and Railway env vars)
- API consumers: `X-API-Key` header (SHA-256 hash lookup)
- The browser **never** sends `user_id` directly to the backend — Next.js verifies the session and forwards trusted user context
- Admin: HMAC cookie OR `users.is_admin` flag
- User auth: magic-link via Resend, signed httpOnly cookie with user ID

## Utils (`backend/utils/`)

| File | Purpose |
|------|---------|
| `irysUploader.js` | Core upload function. Uses Irys devnet with Ethereum (Sepolia) wallet. Tags files with Content-Type, Filename, Original-Size, MD5. **Currently hardcodes Ethereum ledger** (line ~75). |
| `reupload.js` | `reuploadFromExisting(record)` — re-uploads to Irys. Prefers volume original, falls back to gateway. Validates byte count against `record.size`. |
| `originals.js` | `preserveOriginal(tmpPath, uuid)` — saves to `/data/originals/<uuid>`. Also `getOriginalPath()`, `getOptimizedPath()`. |
| `videoOptimize.js` | `optimizeAndUpload(uuid)` — ffmpeg faststart remux (no re-encoding), saves to `/data/optimized/<uuid>.mp4`, uploads to Irys, stores URL in `stream_url`. |
| `alerts.js` | `sendAlert({ key, subject, html })` — email via Resend with 6h cooldown per key. Graceful degradation if `RESEND_API_KEY` not set. |
| `quota.js` | `checkUploadQuota(userId, ip)` — server-side quota enforcement against active plan limits. |
| `sanitize.js` | `isSafeTusId(id)` (path-traversal hardening), `sanitizeFilename(name)`. |
| `clientInfo.js` | Extracts IP, user-agent, referer from request. |
| `geo.js` | Fire-and-forget IP geolocation via ipapi.co (free, 1000 req/day). |

## Frontend

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Zustand, Recharts, Framer Motion, Lucide icons. EN + ES i18n via custom dict system.

### Key Pages

| Route | Purpose |
|-------|---------|
| `/` | Home — upload dropzone (drag & drop, TUS) |
| `/auth` | Magic link login |
| `/me` | Dashboard — uploads, folders, plan usage |
| `/me/setup` | Handle picker (first login) |
| `/me/settings` | Profile settings |
| `/me/folders/[id]` | Folder editor (files, privacy, settings) |
| `/pricing` | Plan cards, comparison table |
| `/checkout/[planSlug]` | Payment method picker (Stripe/Recurrente/crypto) |
| `/u/[handle]` | Public profile + folder grid |
| `/u/[handle]/f/[slug]` | Public folder with access control |
| `/admin` | Admin dashboard (cron status, uploads, users, funding) |
| `/claim` | Pre-claim account activation |

### Key Components

| Component | Purpose |
|-----------|---------|
| `HomeUploadHero` | Drag-drop upload with TUS, anon/logged-in limits, folder picker |
| `FolderEditor` | Full folder management — files, settings, privacy (password/email) |
| `FolderAccessGate` | Password form + sign-in prompt for protected folders |
| `CheckoutButtons` | Stripe/Recurrente redirect + StablePay widget inline |
| `AuthModal` | Magic link sign-up/sign-in overlay |

### Server-to-Server Communication

All backend calls go through `app/lib/backend.ts`:
- `backendFetch(path, options)` — adds `X-Admin-Secret` header
- `backendJson(path, options)` — same, parses JSON response

## Environment Variables

### Backend (Railway)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PRIVATE_KEY` | Yes | — | Ethereum wallet key (Sepolia) for Irys uploads |
| `SEPOLIA_RPC` | Yes | — | Ethereum Sepolia RPC endpoint |
| `ADMIN_BACKEND_SECRET` | Yes | — | Server-to-server auth (must match Vercel) |
| `ALLOWED_ORIGINS` | Yes | — | CORS origins (comma-separated) |
| `FRONTEND_URL` | Yes | — | Checkout redirect base URL |
| `RESEND_API_KEY` | Yes | — | Magic link & alert emails |
| `DB_PATH` | No | `backend/data/stash.db` | SQLite database path |
| `PORT` | No | `5050` | Server port |
| `STRIPE_SECRET_KEY` | For payments | — | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | For payments | — | Stripe webhook signature |
| `RECURRENTE_SECRET_KEY` | For payments | — | Recurrente webhook signature |
| `STABLEPAY_WEBHOOK_SECRET` | For payments | — | StablePay webhook signature |
| `ALERT_FROM` | No | `alerts@offsetworks.xyz` | Alert email sender |
| `ALERT_TO` | No | `gasolomonc@gmail.com` | Alert email recipient |
| `REFRESH_AFTER_DAYS` | No | `20` | Days before refresh is due |
| `REFRESH_MAX_PER_RUN` | No | `50` | Max files refreshed per cron run |
| `REUPLOAD_MAX_PER_RUN` | No | `50` | Max files backfilled per cron run |
| `VERIFY_REPAIR_MAX_PER_RUN` | No | `50` | Max repairs per verify run |
| `SEPOLIA_LOW_THRESHOLD` | No | `0.1` | ETH balance alert threshold |
| `IRYS_LOW_THRESHOLD` | No | `0.005` | Irys balance auto-fund trigger |
| `IRYS_AUTO_FUND_AMOUNT` | No | `0.1` | ETH to auto-fund when low |
| `ANON_DAILY_IP_LIMIT` | No | `3` | Anonymous uploads per IP per day |
| `REFRESH_CRON_DISABLED` | No | — | Set to `1` to disable refresh cron |
| `REUPLOAD_CRON_DISABLED` | No | — | Set to `1` to disable backfill cron |
| `VERIFY_CRON_DISABLED` | No | — | Set to `1` to disable verify cron |
| `ALERT_CRON_DISABLED` | No | — | Set to `1` to disable alert cron |

### Frontend (Vercel)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_UPLOAD_SERVER` | Yes | Backend URL for TUS + API |
| `ADMIN_BACKEND_SECRET` | Yes | Same as backend (server-to-server) |
| `ADMIN_PASSWORD` | Yes | Admin login + HMAC signing key for cookies/tokens |
| `RESEND_API_KEY` | Yes | Magic-link emails |
| `ALLOWED_ADMIN_EMAILS` | No | Comma-separated admin email list |
| `MAX_ANONYMOUS_UPLOADS` | No | Browser-side limit before sign-up prompt (default 1) |
| `MAX_FILE_SIZE_MB` | No | Max upload size shown to users (default 6144 = 6GB) |

## Funding & Wallets

### Wallet Address

```
0x23de198f1520ad386565fc98aee6abb3ae5052be
```

Derived from the `PRIVATE_KEY` env var. Faucet Sepolia ETH to this address.

### Three Irys Devnet Ledgers

Irys devnet keeps separate balances per chain. The uploader currently **only uses Ethereum**.

| Ledger | Balance (as of 2026-09-16) | Status |
|--------|---------------------------|--------|
| Irys devnet (Ethereum) | ~0.289 ETH | **Active** — the uploader uses this |
| Sepolia wallet | ~0.038 ETH | **Low** — auto-fund source for Irys |
| Irys devnet (Base-ETH) | ~0.137 ETH | **Stranded** — uploader hardcodes Ethereum ledger |

### How Funding Works

1. Faucet Sepolia ETH to the wallet address
2. The alerts cron auto-funds Irys from Sepolia when Irys ledger drops below `IRYS_LOW_THRESHOLD`
3. Or manually fund via admin panel or `POST /api/v1/fund-irys`

### Funding Constraint

Next full refresh cycle costs ~0.349 ETH. Available: ~0.327 ETH. **One more cycle then it runs dry.** The 0.137 ETH on base-sepolia would cover the gap if the multi-ledger uploader were built.

The cron handles low balance safely — it stops early and emails instead of corrupting anything. But refreshes stall until funded.

## UMO Integration

UMO Archive (concert video platform) adopted Stash to hold HD originals. On 2026-09-06, 112 of 214 devnet moments (12.04 GB, size-verified) were imported via `POST /admin/import-url`.

| Category | Count | Outcome |
|----------|-------|---------|
| Alive, correct size | 112 | Imported (12.04 GB) |
| Dead (404) | 54 | Gone, no 480p either |
| Alive, wrong size | 38 | HD gone, only 300–750 KB shell |
| Ambiguous (devnet > Mongo size) | 10 | Needs UMO to confirm real sizes |

- Source: `umo` in uploads table
- API key prefix: `stash_fd807c`
- Handoff map: `~/.stash-umo-handoff.json`
- Adds ~0.204 ETH per refresh cycle
- First refresh due: ~2026-09-26

## Payment Trust Model

**Do not break these invariants:**

1. **Client NEVER activates plans** — only verified webhooks or admin grants. `stablepay-confirm` writes `status:'pending', payment_status:'unpaid'` only.
2. **Webhooks fail closed** — if signing secret env var is unset, they return 501 + alert email. Never silently accept unverified webhooks.
3. **Raw body verification** — Recurrente/StablePay HMACs are verified over raw body bytes (`express.raw`), never re-serialized JSON.
4. **Idempotent** — duplicate webhook deliveries are handled via unique `(payment_provider, payment_reference)` index.
5. **Auto-expiry** — `getActiveUserPlan()` only honors `status = 'active'`; rows past `ends_at` are auto-expired on read.

### Webhook Endpoints

| Provider | URL | Signature |
|----------|-----|-----------|
| Stripe | `/api/v1/webhook/stripe` | `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` |
| Recurrente | `/api/v1/webhook/recurrente` | HMAC-SHA256 of body with `RECURRENTE_SECRET_KEY` |
| StablePay | `/api/v1/webhook/stablepay` | HMAC-SHA256 of body with `STABLEPAY_WEBHOOK_SECRET` |

## File Serving

Three endpoints serve files with Range support (required by Safari for `<video>`/`<audio>`):

| Endpoint | Behavior |
|----------|----------|
| `/f/:uuid` | Serves optimized copy if available → original from volume → 302 redirect to gateway. Deliberate 302 + `no-store` (301 would cache and recreate dead links). |
| `/f/:uuid/raw` | Same logic, prefers faststart remux (different byte count, content-type forced to video/mp4). |
| `/f/:uuid/original` | Exact uploaded bytes from volume. Never falls back to gateway. For integrity verification. |

**A local copy is only served when its byte count matches `uploads.size`.** The
gateway's eviction error page is a ~4904-byte HTML app shell that arrives with
HTTP 200, and 143 uploads from the 2026-09 corruption wave still have one sitting
on the volume under their uuid. Serving it handed consumers HTTP 200 plus HTML
for a file that no longer exists. Those requests now get **410 Gone** with the
recorded size in the body — never a 302 to the gateway, because the gateway is
where the error page came from. `GET /f/:uuid/meta` reports `"status":"gone"` and
a `content_url` of null for the same files, so consumers cannot mistake them for
live ones. `pickLocalCopy()` in `server.js` is the single place that decides this.

Consumers should store `/f/:uuid` URLs, never raw gateway URLs.

## Pending Work

### Critical

| Item | Why |
|------|-----|
| Faucet Sepolia to wallet | Current balance covers ~1 more refresh cycle. After that, refreshes stall. |
| Rotate Stripe + Recurrente keys | Leaked in chat 2026-05-28. Must rotate before going live with payments. |
| Vercel git deploys never start | Every production deployment triggered by a push since 2026-08-25 sits in **Canceled** with a 0ms build — the build never runs, so the live aliases stay on the old deployment. The site was 22 days stale on 2026-09-16 (aliases `aeter-eight.vercel.app` and `stash.offsetworks.xyz` pointed at a 2026-08-25 build) even though Railway was current. A manual `vercel --prod` from the repo root built in 1m and took the aliases, so the code is fine and this is a Git-integration/config problem — check the project's Git connection and Ignored Build Step in the Vercel dashboard. **Until it is fixed, `git push` does NOT ship the frontend: run `vercel --prod` after pushing.** |

### Important

| Item | Why |
|------|-----|
| Multi-ledger uploader | Unlocks 0.137 ETH on base-sepolia. Currently hardcoded to Ethereum in `irysUploader.js`. Would let all 3 testnet faucets fund uploads. |
| CNAME `stash.offsetworks.xyz` | Add `stash` CNAME → `cname.vercel-dns.com` at DNS, add domain in Vercel. |
| Admin UI threshold mismatch | `ExpiringSoon.tsx` shows `REFRESH_THRESHOLD_DAYS = 15` vs backend's 20. Cosmetic but confusing. |

### Nice-to-Have

| Item | Why |
|------|-----|
| UMO's 10 ambiguous files | devnetSize > Mongo fileSize; needs UMO to confirm real sizes. |
| StablePay webhook setup | `STABLEPAY_WEBHOOK_SECRET` not set; crypto payments stay pending. |
| Recurrente product setup | Products not created, webhook not registered. |

## Runbook

### Dev Setup

```bash
# Backend
cd backend && npm install && node server.js
# → http://localhost:5050

# Frontend (from repo root)
npm install && npm run dev
# → http://localhost:3000

# Tests
cd backend && npm test
```

### Deploy

```bash
git add -A && git commit -m "..." && git push origin main
# Railway auto-deploys from main (verified working).
# Vercel does NOT: git-triggered production deploys have been sitting in
# "Canceled" with a 0ms build since 2026-08-25, so follow the push with a
# manual production deploy or the frontend stays on the old build:
vercel --prod --yes     # from the repo root; ~1 min
```

### "Refreshes are failing"

1. Check Irys balance: admin panel or `GET /api/v1/irys-balance`
2. If low, check Sepolia balance (alerts cron auto-funds Irys from Sepolia)
3. If Sepolia is also low, faucet ETH to `0x23de198f1520ad386565fc98aee6abb3ae5052be`
4. Or manually fund: `POST /api/v1/fund-irys` with admin secret

### "Files showing wrong content"

1. This is the HTML-shell problem. Check verify sweep logs in `cron_runs` table.
2. If the file has a volume original, the verify sweep will auto-repair within 24h.
3. To force repair: `POST /admin/refresh` with admin secret.
4. If no volume original exists and devnet copy is corrupted, the file is **unrecoverable**.

### "A /f/ link returns 410 Gone"

1. That is deliberate and correct: the copy on the volume is provably not the file
   that was uploaded (byte count disagrees with `uploads.size`) — i.e. it is the
   gateway's HTML error page. Same population as the 143-file incident.
2. Confirm the scale: `GET /api/v1/admin/backfill` → the `corrupt` count. Zero means
   every loss has been acknowledged and marked; anything above zero is a file the
   cron has not given up on yet.
3. Nothing to repair by hand. Those bytes are gone; a 302 to the gateway would only
   hand the consumer the error page again with a 200 status.

### "Volume is full"

1. Check usage: `df -h /data` inside Railway container
2. As of 2026-09-16: 21.8 / 50 GB. Room for ~28 GB more.
3. Railway volume can be resized in the dashboard.

### Security Notes

- `ADMIN_BACKEND_SECRET` must match between Vercel and Railway
- Browser never sends `user_id` directly to the backend
- TUS upload IDs validated with `isSafeTusId()` (path-traversal hardening)
- API keys stored as SHA-256 hashes, never plaintext
- All webhook signature verification uses timing-safe comparison

---

*Generated 2026-09-16. For canonical project docs, see `CLAUDE.md` in repo root.*
