# Storage Classes — Design Spec

**Date:** 2026-07-22
**Status:** Approved by GS (pending spec review)
**Project:** Stash (Aeter) — permanent file storage platform

## Problem

Today every upload goes to Irys **devnet**: free, evicted after ~60 days, and the
gateway itself went down for weeks in July 2026. The product markets "permanent
storage" but nothing is on-chain permanent; real durability comes from copies on
the Railway volume. Plans meter upload *counts*, not bytes, so a paying user
could cost more in storage than they pay. There is no way to distinguish, query,
or price different durability levels.

## Goal

Three explicit storage classes with different backends, lifetimes, and prices:

| Class | Who | Backend | Lifetime | Cost to operator |
|---|---|---|---|---|
| `temp` | Free tier + anonymous | Irys devnet | 30 days hard expiry | ~zero |
| `permanent` | Paid tiers | Irys **mainnet** (Arweave) | Forever, survives cancellation | ~$5–10/GB one-time (verify live) |
| `internal` | Operator only (admin/API-key uploads) | Devnet + refresh cron + volume | Best-effort forever ("free but risky") | volume storage only |

Every table, quota, cron, serving path, and admin view becomes class-aware.

## Decisions (made with GS)

1. **Free tier = hard expiry.** Temp links die at 30 days (< devnet's ~60-day
   eviction, so we expire on our schedule, not devnet's). Volume original is
   deleted at expiry. Link returns 410 with an upsell page.
2. **Paid tiers = GB allowance per month.** Permanent uploads draw from a
   monthly byte allowance; unused does not roll over. Archive (lifetime plan)
   gets a one-time total-bytes bucket.
3. **Upgrade flow: user picks.** On upgrade, the user selects which of their
   unexpired temp files to promote to permanent, drawing from their allowance.
4. **Existing 688 files → `internal`.** The operator's own project files (KOH,
   FlyIn, PEZ, Lynx, …) keep the devnet + refresh-cron + volume strategy.
   Not customer-facing.
5. **Paid users get a per-upload toggle** (default permanent). A temp upload by
   a paid user follows free-tier rules and does not touch the GB allowance.

## Non-goals

- No per-file pricing / pay-as-you-go (plans only).
- No migration of internal files to mainnet now (admin bulk-promote exists if
  wanted later).
- No change to auth, folders, payments rails, or the TUS pipeline shape.
- No storage-backends abstraction table — one class column is enough for three
  fixed classes.

## Schema — migration v13

```sql
ALTER TABLE uploads ADD COLUMN storage_class TEXT NOT NULL DEFAULT 'internal'
  CHECK (storage_class IN ('temp','permanent','internal'));
ALTER TABLE uploads ADD COLUMN expires_at TEXT;         -- temp only
ALTER TABLE uploads ADD COLUMN expired INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_uploads_class ON uploads(storage_class, expires_at);

ALTER TABLE plans ADD COLUMN storage_class TEXT NOT NULL DEFAULT 'temp'
  CHECK (storage_class IN ('temp','permanent'));
ALTER TABLE plans ADD COLUMN monthly_storage_bytes INTEGER;  -- permanent allowance/month
ALTER TABLE plans ADD COLUMN total_storage_bytes INTEGER;    -- one_time plans bucket
```

Backfill in the same migration: all existing uploads → `internal` (the DEFAULT
handles this). `upload_links` is unchanged — it remains the refresh history,
filterable by class via join.

Plan seed updates (values admin-tunable via existing plans admin):

| Plan | storage_class | monthly_storage_bytes | total_storage_bytes |
|---|---|---|---|
| Drift (free) | temp | NULL | NULL |
| Signal $9/mo | permanent | 500 MB | NULL |
| Beacon $29/mo | permanent | 2 GB | NULL |
| Archive $299 | permanent | NULL | 20 GB |

Numbers are deliberately conservative until a live mainnet `getPrice()` quote is
checked during implementation. Raising limits later is a gift; lowering is a
scandal.

## Upload pipeline

`utils/irysUploader.js` gains a `permanence` parameter:

- `temp` / `internal` → `.devnet()` uploader (Sepolia-funded, as today).
- `permanent` → `.mainnet()` uploader — same wallet key, funded with real ETH.
  Implementation must include a startup/manual `getPrice()` sanity check and a
  funded-balance check *before* accepting the upload.

Class resolution at upload time (both TUS `/complete` and `/api/v1/upload`):

1. Admin-secret or API-key upload → `internal` (operator surface), unless the
   request explicitly passes another class.
2. Authenticated user with active paid plan → `permanent` by default; request
   may pass `storage_class: temp` (toggle).
3. Free user / anonymous → `temp`, `expires_at = now + 30 days`.

Quota check (in `utils/quota.js`, *before* the chain upload):

- `permanent`: `SUM(size) of this user's permanent uploads this calendar month`
  + incoming size ≤ plan's `monthly_storage_bytes` (or lifetime total vs
  `total_storage_bytes` for one_time plans). Reject with a clear
  "storage allowance exceeded" error.
- `temp`: existing count-based daily/monthly limits stay.
- `internal`: no quota.

Volume originals are still preserved for **every** class — the volume remains
the serving cache and the source for promotions/refreshes.

## Serving `/f/:uuid`

- `permanent` → 302 to `https://arweave.net/<arweave_id>` (mainnet data is
  genuinely on Arweave); volume fallback if gateway errors are detected later.
- `internal` → 302 to current devnet URL; volume fallback (today's behavior).
- `temp` before expiry → 302 to devnet URL.
- `temp` after expiry → **410 Gone** + minimal HTML upsell page ("this temp
  file expired — paid plans keep files forever"), `Cache-Control: no-store`.

## Crons

1. **Refresh cron** (revival of the original re-upload strategy):
   `internal` only. Re-uploads to devnet from the volume original before the
   ~60-day eviction, writes a new `upload_links` row, updates `irys_url`.
2. **Expiry cron** (new, hourly): `temp` rows with `expires_at < now AND
   expired = 0` → set `expired = 1`, delete volume original. Keep the DB row
   for admin history.
3. **Backfill cron**: unchanged.
4. **Alerts**: add mainnet wallet balance check (permanent uploads fail closed
   without funds — that is a real, actionable alert). Keep Sepolia check for
   devnet classes.

## Upgrade / promotion flow

- `/me` (frontend) lists unexpired temp files with sizes when the user has a
  paid plan; user selects files to promote.
- Backend `POST /api/v1/me/promote` with upload uuids: for each, re-upload the
  volume original to mainnet → new `arweave_id`/`irys_url`, class →
  `permanent`, `expires_at` cleared; bytes count against the monthly allowance
  (same quota check as uploads, atomically per batch).
- Admin equivalent: `POST /api/v1/admin/promote` (any file, optionally
  bypassing quota) — doubles as the bulk-promote tool for internal files.

## Admin

- `storage_class` filter parameter on every admin/uploads listing endpoint.
- Stats endpoint gains per-class breakdowns: count, total bytes, and
  current-month permanent bytes (the operator's real spend proxy).
- Bulk reclassify endpoint (e.g. mark a set of files internal).
- Everything stays behind the existing admin-secret auth.

## Error handling

- Mainnet upload failures (insufficient balance, RPC down): fail the upload
  request with a specific error; never silently downgrade a paid upload to
  devnet.
- Promotion failures: per-file result list; already-promoted files are
  idempotent no-ops.
- Expiry cron and refresh cron follow the existing cron_runs bookkeeping and
  crash-only alerting.

## Testing

- Quota: byte-allowance math across month boundaries; one_time bucket;
  temp-toggle uploads not counting against allowance.
- Class resolution: admin/API-key → internal; paid → permanent; free/anon →
  temp with expires_at set.
- Serving: 410 after expiry; correct gateway per class.
- Expiry cron: deletes original, marks expired, leaves row.
- Promotion: class flip, allowance deduction, idempotency.
- Migration v13: existing rows → internal, plans seeded correctly.

## Rollout

1. Ship migration + class-aware pipeline with mainnet uploads **feature-flagged
   off** (env `MAINNET_UPLOADS_ENABLED=0`) until the mainnet wallet is funded
   and a test upload is verified end-to-end.
2. Fund mainnet wallet, verify one real permanent upload, flip the flag.
3. Frontend: pricing page copy update (temp vs forever), upload toggle,
   promotion picker, expired-file page.
4. Payments prerequisites unchanged and still required before selling: rotate
   leaked Stripe/Recurrente keys, set STABLEPAY_WEBHOOK_SECRET.
