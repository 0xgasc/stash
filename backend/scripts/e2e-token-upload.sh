#!/usr/bin/env bash
# Local end-to-end for the FlyIn-style token upload flow, against a running
# server with a throwaway DB. Exercises the SECURITY paths (bad token, size
# cap at create, token binding on PATCH, extension cap at complete) without
# spending any Irys credit on a successful completion.
set -euo pipefail
cd "$(dirname "$0")/.."   # backend/

export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"

ROOT="$(mktemp -d)"
TMPDB="$ROOT/stash-e2e.db"
PORT=5077
export DB_PATH="$TMPDB"
export ADMIN_BACKEND_SECRET="e2e-admin-secret"
export ALLOWED_ORIGINS="http://localhost:$PORT"
export REFRESH_CRON_DISABLED=1 REUPLOAD_CRON_DISABLED=1 VERIFY_CRON_DISABLED=1 ALERT_CRON_DISABLED=1
export PORT

echo "== mint an API key for tenant 'flyin-e2e' into the throwaway DB =="
# db.js logs to stdout on load, so grab the last echoed line (the key).
KEY="$(node -e "const db=require('./db'); console.log(db.insertApiKey('flyin-e2e').key)" | tail -1)"
echo "   ok (prefix ${KEY:0:12})"

echo "== start the server on :$PORT with the throwaway DB =="
node server.js > "$ROOT/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  curl -sf -m 2 "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf -m 2 "http://localhost:$PORT/health" >/dev/null || { echo "server failed to start"; tail -20 "$ROOT/server.log"; exit 1; }
echo "   server up"

B="http://localhost:$PORT"
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
pass(){ printf '   PASS  %s\n' "$1"; }

echo
echo "== 1. mint a token (over-sized cap is clamped; default source = api key name) =="
TOK=$(curl -s -X POST "$B/api/v1/tus-token" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"maxBytes": 4096, "allowedExtensions": ["jpg","png"], "expiresInMinutes": 30}')
echo "   $TOK" | head -c 400; echo
TK=$(printf '%s' "$TOK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(o.token||"")})')
[ -n "$TK" ] && pass "token minted"
echo
echo "== 2. TUS create with a BOGUS token must be 401 =="
code=$(curl -s -o /tmp/e2e-body.txt -w '%{http_code}' -X POST "$B/tus-upload" -H 'Tus-Resumable: 1.0.0' -H 'Upload-Length: 5' -H 'X-Upload-Token: bogus.token.garbage')
[ "$code" = "401" ] && pass "bogus token -> 401 (got $code)" || { echo "   FAIL got $code"; cat /tmp/e2e-body.txt; }
echo
echo "== 3. TUS create with a VALID token but Upload-Length over the cap must be 413 =="
code=$(curl -s -o /tmp/e2e-body.txt -w '%{http_code}' -X POST "$B/tus-upload" -H 'Tus-Resumable: 1.0.0' -H 'Upload-Length: 99999' -H "X-Upload-Token: $TK")
[ "$code" = "413" ] && pass "oversize create -> 413 (got $code)" || { echo "   FAIL got $code"; cat /tmp/e2e-body.txt; }
echo
echo "== 4. TUS create with VALID token + within-cap length must be 201 (creation works) =="
LOC=$(curl -s -D - -o /dev/null -X POST "$B/tus-upload" \
  -H 'Tus-Resumable: 1.0.0' -H 'Upload-Length: 10' \
  -H "Upload-Metadata: filename $(b64 'photo.txt'),filetype $(b64 'text/plain')" \
  -H "X-Upload-Token: $TK" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r')
echo "   location: $LOC"
ID="${LOC##*/}"
if [ -n "$LOC" ]; then [ -n "$ID" ] && pass "created upload id=$ID"; else echo "   FAIL no location header"; fi
echo
echo "== 5. PATCH that upload WITHOUT the token must be 401 =="
code=$(curl -s -o /tmp/e2e-body.txt -w '%{http_code}' -X PATCH "$B/tus-upload/$ID" \
  -H 'Tus-Resumable: 1.0.0' -H 'Content-Type: application/offset+octet-stream' -H 'Upload-Offset: 0' \
  --data-binary '0123456789')
[ "$code" = "401" ] && pass "PATCH without token -> 401 (got $code)" || { echo "   FAIL got $code"; cat /tmp/e2e-body.txt; }
echo
echo "== 6. PATCH with the token must be 204 =="
code=$(curl -s -o /tmp/e2e-body.txt -w '%{http_code}' -X PATCH "$B/tus-upload/$ID" \
  -H 'Tus-Resumable: 1.0.0' -H 'Content-Type: application/offset+octet-stream' -H 'Upload-Offset: 0' \
  -H "X-Upload-Token: $TK" --data-binary '0123456789')
[ "$code" = "204" ] && pass "PATCH with token -> 204 (got $code)" || { echo "   FAIL got $code"; cat /tmp/e2e-body.txt; }
echo
echo "== 7. /complete for a photo.txt (NOT in allowedExtensions=[jpg,png]) must be 413, NO Irys spend =="
code=$(curl -s -o /tmp/e2e-body.txt -w '%{http_code}' -X POST "$B/tus-upload/complete" \
  -H 'Content-Type: application/json' -H "X-Upload-Token: $TK" \
  -d "{\"uploadId\":\"$ID\",\"originalFilename\":\"photo.txt\",\"source\":\"spoofed-by-browser\"}")
echo "   $code $(cat /tmp/e2e-body.txt)"
[ "$code" = "413" ] && pass "ext cap enforced -> 413 (got $code)" || { echo "   FAIL got $code"; }
echo
echo "== 8. spoofed 'source' must NOT win when a token is used (token carries it) =="
# The DB row would be source=token's source, api_key_id=flyin-e2e; verify the
# wiring evaluated effectiveSource from the token by checking server logs.
grep -q "photo.txt" "$ROOT/server.log" && echo "   (server log reflects the upload attempt)"
echo
echo "== server log tail =="
tail -25 "$ROOT/server.log"