#!/usr/bin/env bash
# End-to-end API test against the local harness (wrangler.test.jsonc).
#
#   bash test/api-test.sh [base-url]
#
# Exercises the real buildApi() router against local D1/R2. The session comes
# from a test cookie understood only by test/harness.ts, which is never
# deployed. Each run uses fresh users and takes its targets from the discover
# response, so the script stays valid as seed data changes.
set -uo pipefail

BASE="${1:-http://127.0.0.1:8789}"
ORIGIN="http://localhost:8789"
RUN=$(date +%s)$RANDOM
ALICE="test_user=alice-$RUN"
BOB="test_user=bob-$RUN"
CODE=""
RES=""
PASS=0
FAIL=0

req() { # method path cookie data [content-type] [extra curl args...]
  local method=$1 path=$2 cookie=$3 data=$4 ctype=${5:-application/json}
  shift 5 2>/dev/null || shift 4
  local args=(-sS -m 20 -X "$method" -H "Origin: $ORIGIN" -w $'\n%{http_code}')
  [ -n "$cookie" ] && args+=(-H "Cookie: $cookie")
  if [ -n "$data" ]; then
    if [ "${data:0:1}" = "@" ]; then args+=(--data-binary "@${data:1}"); else args+=(--data "$data"); fi
    args+=(-H "Content-Type: $ctype")
  fi
  args+=("$@")
  local out
  out=$(curl "${args[@]}" "$BASE$path" 2>&1)
  CODE="${out##*$'\n'}"
  RES="${out%$'\n'*}"
}

ok() { # name expected-code [must-contain]
  local name=$1 want=$2 needle=${3:-}
  if [ "$CODE" = "$want" ] && { [ -z "$needle" ] || [[ "$RES" == *"$needle"* ]]; }; then
    PASS=$((PASS + 1))
    printf '  \033[32mPASS\033[0m %s\n' "$name"
  else
    FAIL=$((FAIL + 1))
    printf '  \033[31mFAIL\033[0m %s (code=%s want=%s)\n      body: %s\n' "$name" "$CODE" "$want" "${RES:0:400}"
  fi
}

field() { # dotted key from the last response
  node -e '
    const k = process.argv[1].split(".");
    let s = "";
    process.stdin.on("data", d => (s += d)).on("end", () => {
      try { let v = JSON.parse(s); for (const p of k) v = v?.[p];
        process.stdout.write(v === undefined || v === null ? "" : String(v));
      } catch { process.stdout.write(""); }
    });' "$1" <<<"$RES"
}

# A real 1x1 PNG — the server checks image magic bytes, not just the header.
node -e "require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2],'base64'))" /tmp/spark.png \
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

echo "API tests against $BASE  (run $RUN)"
echo

echo "auth & session"
req GET /api/health "" ""
ok "health is public" 200 '"harness":true'
req GET /api/me "" ""
ok "protected route is 401 when signed out" 401 "Sign in required"
req POST /api/swipes "" '{"targetId":"demo-061","kind":"like"}'
ok "writes are 401 when signed out" 401
req POST /api/swipes "$ALICE" '{"targetId":"demo-061","kind":"like"}' "" "application/json" -H "Origin: https://evil.example"
ok "foreign Origin is rejected with 403" 403 "Cross-origin"
req POST /api/swipes "$ALICE" '{"targetId":"demo-061","kind":"like"}' "" "application/json"
ok "same-origin write is allowed" 200 '"matched":true'

echo
echo "profile setup"
req PUT /api/me/profile "$ALICE" '{"name":"Alice","age":17,"gender":"woman","city":"New York","bio":"hi","intent":"casual","seeking":["man"]}'
ok "under-18 age rejected" 400 "18"
req PUT /api/me/profile "$ALICE" '{"name":"Alice","age":17,"gender":"nonbinary","city":"New York","bio":"hi","intent":"casual","seeking":["man"]}'
ok "under-18 age is not silently accepted" 400 "18"
req PUT /api/me/profile "$ALICE" '{"name":"Alice","age":27,"gender":"nonbinary","city":"Atlantis","bio":"hi","intent":"casual","seeking":["man"]}'
ok "unknown city rejected" 400
req PUT /api/me/profile "$ALICE" '{"name":"","age":27,"gender":"nonbinary","city":"New York","bio":"hi","intent":"casual","seeking":["man"]}'
ok "missing name rejected" 400
req PUT /api/me/profile "$ALICE" '{"name":"Alice","age":27,"gender":"nonbinary","city":"New York","bio":"I like long walks and short quizzes.","intent":"casual","seeking":["woman","man","nonbinary"],"interests":["Coffee","Art"]}'
ok "valid profile saves" 200 '"name":"Alice"'
ok "not onboarded without a photo" 200 '"onboarded":false'

req POST /api/me/photos "$ALICE" "definitely not a jpeg" "image/jpeg"
ok "non-image upload rejected" 415
req POST /api/me/photos "$ALICE" "@/tmp/spark.png" "image/png"
ok "photo uploads" 201 '"photos":['
ok "onboarded after first photo" 201 '"onboarded":true'

req GET /api/me "$ALICE" ""
ok "signed-in session returns the profile" 200 '"name":"Alice"'

echo
echo "discovery"
req GET "/api/discover?ageMin=18&ageMax=60&distanceKm=500" "$ALICE" ""
ok "discover returns candidates in the user's city" 200 '"profiles":[{"'
P1_ID=$(field profiles.0.user_id)
P1_NAME=$(field profiles.0.name)
P2_ID=$(field profiles.1.user_id)
P2_NAME=$(field profiles.1.name)
echo "      targets: ${P1_ID:-<none>} (${P1_NAME:-?}) / ${P2_ID:-<none>} (${P2_NAME:-?})"
req GET "/api/discover" "$BOB" ""
ok "discover needs a profile first" 400 "Create your profile"

echo
echo "swipes & matching"
req GET "/api/profiles/$P1_ID" "$ALICE" ""
ok "another member's profile is readable" 200 "\"name\":\"$P1_NAME\""
req POST /api/swipes "$ALICE" "{\"targetId\":\"$P1_ID\",\"kind\":\"like\"}"
ok "liking them creates a match" 200 '"matched":true'
MATCH_ID=$(field matchId)
echo "      match: ${MATCH_ID:-<none>}"
req POST /api/swipes "$ALICE" '{"targetId":"demo-061","kind":"wobble"}'
ok "invalid swipe kind rejected" 400
req POST /api/swipes "$ALICE" "{\"targetId\":\"alice-$RUN\",\"kind\":\"like\"}"
ok "swiping yourself rejected" 400
req GET /api/matches "$ALICE" ""
ok "matches list contains the match" 200 "\"name\":\"$P1_NAME\""

echo
echo "chat"
req POST "/api/matches/$MATCH_ID/messages" "$ALICE" '{"body":"hey — liked your pasta line"}'
ok "message sends" 201 "pasta"
req POST "/api/matches/$MATCH_ID/messages" "$ALICE" '{"body":"   "}'
ok "empty message rejected" 400
req GET "/api/matches/$MATCH_ID/messages" "$ALICE" ""
ok "thread returns the message" 200 "pasta"
req POST "/api/matches/$MATCH_ID/read" "$ALICE" ""
ok "mark-read succeeds" 200 '"ok":true'
req GET "/api/matches/not-a-match/messages" "$ALICE" ""
ok "unknown match id is 404" 404
req GET "/api/matches/$MATCH_ID/messages" "$BOB" ""
ok "another member cannot read the thread" 404

echo
echo "photos"
req GET "/api/photo?u=$P1_ID&k=seed/$P1_ID/0" "$ALICE" ""
ok "seed artwork is served" 200 "<svg"
req GET "/api/photo?u=$P1_ID&k=seed/$P2_ID/0" "$ALICE" ""
ok "photo key must belong to its owner" 404
req GET "/api/photo?u=$P1_ID&k=seed/$P1_ID/0" "" ""
ok "photos require a session" 401

echo
echo "safety"
req POST /api/safety/report "$ALICE" "{\"targetId\":\"$P2_ID\",\"reason\":\"nonsense\"}"
ok "unknown report reason rejected" 400
req POST /api/safety/report "$ALICE" "{\"targetId\":\"$P2_ID\",\"reason\":\"fake\",\"details\":\"odd bio\"}"
ok "report accepted" 201 '"ok":true'
req POST /api/safety/block "$ALICE" "{\"targetId\":\"$P2_ID\"}"
ok "block succeeds" 200 '"ok":true'
req GET "/api/profiles/$P2_ID" "$ALICE" ""
ok "blocked profile hidden" 404
req GET "/api/safety/blocks" "$ALICE" ""
ok "blocked list shows them" 200 "\"name\":\"$P2_NAME\""
req POST /api/swipes "$ALICE" "{\"targetId\":\"$P2_ID\",\"kind\":\"like\"}"
ok "cannot swipe someone you blocked" 403
req DELETE "/api/safety/blocks/$P2_ID" "$ALICE" ""
ok "unblock succeeds" 200 '"ok":true'
req GET "/api/profiles/$P2_ID" "$ALICE" ""
ok "profile returns after unblock" 200 "\"name\":\"$P2_NAME\""

echo
echo "account isolation & deletion"
req GET /api/me "$BOB" ""
ok "bob starts with no profile" 200 '"profile":null'
req DELETE /api/me "$BOB" ""
ok "bob can delete his empty account" 200 '"ok":true'
req DELETE /api/me "$ALICE" ""
ok "alice deletes her account" 200 '"ok":true'
req GET "/api/matches" "$ALICE" ""
ok "her matches are gone after deletion" 200 '"matches":[]'

echo
printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then exit 1; fi
