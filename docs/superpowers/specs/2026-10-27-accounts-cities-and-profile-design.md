# Spark — accounts, city search, radius enforcement and profile signals

**Date:** 2026-10-27
**Status:** awaiting partner approval
**Size:** project (full design)

---

## Intent and why

Spark today has no real account creation: one "Sign in with Freebuff" link, and
production shows "sign-in isn't configured" because no client ID was ever
registered. The city field is a 38-item `<select>`. The radius filter exists but
is not enforced where it matters. The profile's "what are you looking for"
choice is three vague options, and interests are a fixed grid of bubbles.

The partner wants:

1. **Real accounts** — name, email and password, with Google as an option
   (chosen approach A: first-party accounts in our Worker).
2. **A distance filter that actually works** — people may only match with
   others inside their selected radius.
3. **A "DTF" setting** shown on the profile when enabled.
4. **Cities** — not a dropdown, and including all US cities.
5. **More exploratory "interested in" options** than casual / serious / friends.
6. **Interests typed in**, not picked from bubbles.

### Why accounts first

Without accounts there is no product: no way to sign in on the deployed site,
no way to reset a session, no way to gate anything. Everything else in this
document assumes a signed-in user, so accounts are the spine.

---

## Goals

- A person can create an account with **name, email and password**, sign in and
  out, and stay signed in across restarts, on web and in the Android WebView.
- A person can sign in with **Google** (via the existing Freebuff provider, which
  needs no secrets).
- The Worker decides identity on **every** API request; the client cannot assert
  who it is.
- The saved radius is a **server-enforced ceiling** — on discovery, on likes,
  and on swipes.
- City entry is **type-to-search** over every US place, retaining coordinates so
  distance still computes.
- The profile carries a **DTF** flag, visible to other users.
- Interests are **free text**; "looking for" is a **longer, multi-select**
  vocabulary.

## Non-goals

- Government ID or biometric age verification — **legally not required** for a
  US dating app (see Legal basis below) and explicitly declined by the partner.
- Email delivery (verification, password reset) — **decided against**, see Decisions.
- A paid Workers plan — **declined**; free tier is assumed everywhere below.
- Push notifications, photo moderation, iOS, migrations off D1.
- Account merging across identity providers.

## Anti-goals

- Never let the client supply its own user id, email or radius ceiling.
- Never store government ID images, selfies or face geometry.
- Never merge two accounts by matching email (also required by
  `@freebuff/auth/AGENTS.md`).
- Never weaken the existing 401 / foreign-Origin 403 / under-18 rejections.

---

## Constraints

| Constraint | Consequence |
|---|---|
| Cloudflare Workers: **10 ms CPU per request on Free**, and the partner has **declined a paid plan** | Hard ceiling. `limits.cpu_ms` is not available to us, so the password hash must fit inside ~8 ms with headroom for the rest of the request. |
| workerd's PBKDF2 iteration ceiling (~100k, `workerd#1346`) | Cannot reach OWASP's 600k with PBKDF2. |
| Isolate memory **128 MiB** | OWASP's recommended scrypt (128 MiB) does not fit; must use reduced parameters. |
| `nodejs_compat` is already enabled | `node:crypto` scrypt is available to try; Web Crypto PBKDF2 is the fallback. |
| D1 (SQLite) has no guaranteed trig functions | Radius filtering must be a SQL bounding box + exact JS haversine, not `acos()` in SQL. |
| D1 is local-only in this VM | All API tests run against local D1/R2 as they do today. |
| `@freebuff/auth/AGENTS.md`: "Do not add email/password auth … unless the user explicitly asks for one" | The partner explicitly asked. Keeping Freebuff for Google is still correct and needs no secrets. |
| Only `researcher-web` is available as a subagent | The builder check was performed by reading this document as the builder. |

### Legal basis (researched 2026-10-27, not legal advice)

- No US federal law requires an 18+ dating app to verify age with ID; an age
  gate with self-declaration is the norm and what Tinder/Bumble/Grindr actually
  do (Tinder Face Check and Bumble's Veriff ID check are partial or optional).
- 18 U.S.C. § 2257 (ID records proving age) applies to *producers* of sexually
  explicit material and excludes hosting user communications without selecting
  or altering them.
- State age-verification laws (e.g. Texas HB 1181, upheld in *FSC v. Paxton*,
  June 2025) are **content-triggered**: they bite when more than a third of a
  site is material harmful to minors. A dating app is not in scope by category —
  but **user-posted explicit photos move that threshold**, so photo moderation
  matters more legally than ID checks.
- Google Play requires its Restrict Minor Access feature for dating apps but
  prescribes no method; store-age laws (Texas SB 2420, Utah SB 142) target the
  app stores, not the developer.
- **If we did collect ID:** CCPA treats licence numbers and face geometry as
  sensitive PI, Illinois BIPA has a private right of action, and Discord's 2026
  breach exposed ~70k ID photos held by a third party. This is why we do not.
- **Cheapest real obligation found:** Colorado SB24-011 requires a published
  safety policy stating whether and when we verify identity or age.

**Decided age-verification posture (partner, 2026-10-27):**

1. **No ID checks.** No government ID, no document upload, no biometrics at
   sign-up. Age is self-declared at the age gate and enforced at the API —
   under-18 is rejected outright, never silently clamped (already true and
   covered by an existing test).
2. **Publish a safety policy** saying in plain words that age is verified by
   self-declaration, that members must be 18+, and how to report abuse — the
   in-app report/block/unmatch flow plus a contact address, and what happens
   after a report is filed. That is precisely what Colorado SB24-011 asks for
   and it feeds Play's Child Safety Standards requirement.
3. **Platform age signals when generally available.** Google Play's Age Signals
   API (currently beta, returning signals only for eligible Texas accounts) and
   Apple's Declared Age Range. Integrated behind a flag once GA: an under-18
   signal blocks the account exactly as the age gate would. An input, never
   proof of age, never a replacement for the gate.
4. **Vendor-hosted facial age estimation reserved for flagged accounts, stored
   as pass/fail only** — never an ID image, never a selfie, never a face
   template. Designed in Deferred extensions, built with the review flow.

---

## Approaches considered

### Accounts

| Option | What it is | Why not / why |
|---|---|---|
| **A. First-party accounts in our Worker — CHOSEN** | `accounts` + `sessions` tables in the D1 we own; `__Host`-style session cookie; Google via Freebuff as a second button. | Identity lives with profile data, no vendor, no MAU pricing, no SDK in the WebView, identical behaviour in the APK. Cost: we own rate limiting and hashing. |
| B. Clerk | Managed auth, prebuilt UI. | Requires their account and two keys before anything works; documented path is Next.js, not Workers; identity splits across two databases. |
| C. Better Auth | TS library keeping accounts in our DB. | Documented setup uses the `better-sqlite3` native binding, which cannot run in workerd. Would be off-path from line one. |

### City list

| Option | What it is | Why not / why |
|---|---|---|
| **D1 `places` table + typeahead endpoint — CHOSEN** | Import all ~33k US places with coordinates; `GET /api/cities?q=`; client searches as they type. | Keeps distance math working, keeps multi-MB data out of the APK bundle, makes unknown-city rejection meaningful. |
| Bundle a JSON of all cities into the SPA | Static file shipped to every client. | +33k rows in every APK/web load for a field used once. |
| Geocoding API per keystroke | External service per input. | Needs a third-party key, network round trip per character, and returns coordinates we then must store — worse for privacy. |

---

## The design

### 1. Accounts

**Schema (migration `0002_accounts.sql`):**

```sql
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,          -- this is profiles.user_id
  email         TEXT NOT NULL,             -- lower-cased
  password_hash TEXT NOT NULL,             -- versioned algo$params$salt$hash
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX accounts_email_idx ON accounts(email);
```

**Which identities get a row — only local ones.** A Freebuff (Google) identity
keeps working exactly as it does today: its `sub` comes from the OIDC session, no
`accounts` row is written, and `profiles.user_id` *is* that sub. Local accounts
get a row and their id is generated (`u_<random>`). This avoids creating rows at
the OIDC callback, which the SDK owns and we do not intercept. The two kinds are
never merged even when the email matches, per `@freebuff/auth/AGENTS.md`.
```

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,               -- sha256(token), never the token
  user_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE login_attempts (
  bucket_key   TEXT NOT NULL,                  -- sha256(email|ip) or sha256(ip)
  window_start TEXT NOT NULL,
  failures     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
```

**Endpoints** (mounted in `index.ts` *before* `app.route('/api', buildApi(...))`,
so they run ahead of the session guard — the same pattern `test/harness.ts`
already uses for `/api/health`):

| Route | Behaviour |
|---|---|
| `POST /api/auth/signup` | `{name, email, password}` → creates account, starts session, 201. 409 if email taken (generic wording to limit enumeration: "That email can't be used"). |
| `POST /api/auth/signin` | `{email, password}` → session, 200. Always "Email or password is incorrect" on any failure. |
| `POST /api/auth/signout` | Deletes the session row, clears cookie, 200. |
| `GET  /api/auth/session` | `{user}` or 401 — lets the SPA check auth without touching `/api/me`. |

**Worker wiring (`index.ts` restructured).** Today an empty `FREEBUFF_CLIENT_ID`
makes `setup()` return 503 for *every* `/api/*` request. That has to stop being
true — local accounts must work, and be testable, with Google entirely
unconfigured. So `/api/auth/*` and `buildApi()` mount **unconditionally**; only
the Freebuff OIDC routes and the Freebuff half of `getUser` are conditional on
`FREEBUFF_CLIENT_ID`. The "sign-in isn't configured" screen goes away and is
replaced by sign-up; the "Continue with Google" button simply hides when Freebuff
is not configured.

**Test harness.** The 43 assertions run through `test/harness.ts`, which mounts
`buildApi(stubAuth)` and would therefore never see the new routes. The
`/api/auth/*` handlers move into a shared module imported by **both**
`src/worker/index.ts` and `test/harness.ts`, backed by the real account store;
the harness keeps its Freebuff stub, so the two identity paths stay independent.
New auth tests then exercise real signup/signin/session code against local D1.

**Identity resolution.** `buildApi()` receives an object with `getUser(request)`.
That object is now ours:

1. read the session cookie → hash it → `sessions` row not expired → load account
   → return `{sub: account.id, email, name}`.
2. otherwise fall through to `auth.getUser(request)` (Freebuff), unchanged.

`buildApi()` itself does not change. The client cannot forge either path: the
session cookie is `HttpOnly` and the Freebuff path is an OIDC session.

**Password hashing — decision rule.** The partner has ruled out a paid plan, so
10 ms is a hard ceiling rather than a preference:

1. Measure both candidates in local workerd: `node:crypto` **scrypt** (try
   N=2^15, r=8, p=1 — 32 MiB, which fits the 128 MiB isolate where OWASP's
   128 MiB recommendation does not) and **PBKDF2-HMAC-SHA256** via Web Crypto
   across a range of iteration counts.
2. Choose the **strongest parameter set that measures under ~8 ms**, leaving
   headroom for the rest of the request. Expect tens of thousands of iterations
   rather than OWASP's 600k, and hit workerd's ~100k PBKDF2 ceiling anyway
   (`workerd#1346`).
3. **Write the OWASP deviation and its platform reason into the README.** A
   number below guidance is a documented trade-off, not a silent one.
4. Store a versioned record `algo$N$r$p$salt$hash` and **re-hash on every
   successful sign-in**, so the cost can be raised the moment the parameters
   change — including if a paid plan ever arrives.
5. Compensate for the weaker hash with the rate limits below and by never
   revealing whether an email exists.
6. Password rules: 8–100 characters (NIST), no composition rules.
7. **Report the measured number back to the partner** once measured.

**Rate limiting.** `login_attempts` bucketed per 15-minute window:
10 failures per (email+ip) → 429 "Too many attempts, try again later";
5 signups per ip per hour. Failed-but-unknown emails count the same, so
enumeration is not possible from response differences.

**Cookie.** `spark_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=30d`,
server-side expiry in `sessions.expires_at`. `Secure` is set when `APP_ORIGIN`
begins with `https`. The `__Host-` prefix is deliberately **not** used because it
mandates `Secure` and would break the http:// local preview.

**Google.** Unchanged plumbing — `/auth/freebuff/signin` via `createFreebuffAuth`,
which offers Google, GitHub and Apple with no secrets. The sign-in screen's
primary button is labelled **"Continue with Google, Apple or GitHub"** (my call:
honest about what the flow offers and leads with Google as the partner wants).
Local accounts and Freebuff accounts are **never merged**, even for the same
email; if both exist they are two accounts.

**No password reset, no email — decided.** The partner does not want an email
service, so the consequences are accepted explicitly:

- Lost passwords cannot be self-served. The Me screen gains **"Change
  password"** (current + new, while signed in), which revokes every other
  session — so a password can be managed without email, and locked-out users
  recover through you.
- Recovery for a forgotten password is an **operator script**
  (`scripts/reset-password.mjs`, run locally against D1) that sets a new one.
  Zero third-party dependency; it does mean users must contact you.
- **No email verification at sign-up.** Anyone can register with an address they
  don't own. The sign-up copy therefore says the address identifies the account,
  never that we have confirmed it.

**Sign-up screen.** New `SignUp` view: display name, email, password, plus the
Google button and a link to sign-in. Name comes from signup and pre-fills the
onboarding display-name field, which stays as the first onboarding step.

### 2. Cities

**Data.** Source: the **US Census Gazetteer national places file** (all US
places — incorporated cities, towns, villages and CDPs, ~33k rows) with
`INTPTLAT`/`INTPTLONG`. Import script `scripts/import-places.mjs` writes
`migrations/0003_places.sql`. Public domain, no API key, no per-call cost.

The existing 38 cities are **kept**, including the non-US entries (Berlin,
London, Toronto…); any not already present are inserted with their current
coordinates, and every seeded profile keeps working.

**Schema:**

```sql
CREATE TABLE places (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT '',   -- 'CA', 'TX', '' for non-US
  country     TEXT NOT NULL DEFAULT 'US',
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  population  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX places_name_idx ON places(name COLLATE NOCASE);
CREATE INDEX places_name_state_idx ON places(name COLLATE NOCASE, state);
```

**`profiles` gains `state TEXT NOT NULL DEFAULT ''`.** Without it "Springfield"
is ambiguous across 30+ states and the coordinates would be wrong. The typeahead
returns a `{name, state}` pair; the profile stores both; the UI shows
"Springfield, MO". Existing rows keep `state = ''` and render as today.

**Endpoint:** `GET /api/cities?q=spring&limit=10` (auth required, 2+ characters)
→ `[{name, state, country, population}]`, ranked by prefix-then-substring match
and then population descending. Replaces the `cities` array that `/api/me`
currently ships — payload drops from 38 entries to zero. Consequently
`MeResponse.cities`, the `City` type and the `cities` prop threaded from
`App.tsx` into `Onboarding` and `Me` are **removed**; those two screens call the
typeahead endpoint through a small debounced hook instead.

**Validation:** `PUT /me/profile` resolves `{city, state}` against `places` and
rejects unknown names with 400 "Choose a city from the list" — the existing
"Atlantis" test keeps passing, now against 33k rows instead of 38.

**UI:** a search input with debounced results replacing the `<select>` in both
`Onboarding.tsx` and `Me.tsx`.

### 3. Radius enforcement

The saved `max_distance_km` becomes a hard server-side ceiling.

1. **Ceiling.** `distanceKm = min(clampInt(query, 1, 500), mine.max_distance_km)`
   in `GET /discover`. Today the query can request 500 regardless of what the
   user saved. The same bug exists for age: `ageMin`/`ageMax` are clamped to
   18–120 but not into `mine.age_min..mine.age_max` — fixed identically.
2. **Feed starvation.** Distance is currently applied in JS *after* SQL has
   picked `LIMIT 80 ORDER BY RANDOM()`, so a tight radius can return nothing
   even when many people are nearby. Fix: compute the bounding box in JS from my
   latitude/longitude and radius (`±km/111.045` latitude, `±km/(111.045·cos lat)`
   longitude), filter in SQL with plain `BETWEEN` comparisons (no trig needed in
   SQLite), then apply the exact haversine check in JS to the bounded rows.
3. **Swipes.** `POST /swipes` currently checks existence, visibility and blocks —
   **not distance**. Add: for `like` and `super`, reject with 400
   "Outside your radius" when haversine(me, target) > `mine.max_distance_km`.
   Each user's own radius governs their own outgoing swipe; since a match needs
   mutual likes, both radii are respected by construction.
4. **Likes.** `GET /likes` applies the same radius filter so out-of-radius
   admirers are neither shown nor matchable.
5. **Missing coordinates.** A profile with null `lat`/`lng` has no verifiable
   distance. My call: such rows are **excluded** from discovery and likes rather
   than passed through — today `distanceOf` returns null and the row sails past
   the filter entirely. Every row in `places` has coordinates, so this only
   affects profiles saved before the city import.
6. Slider stays 1–500 km, default 100, in `Discover.tsx` and `Me.tsx`.

### 4. DTF flag — with visibility the owner chooses

Decided: **the profile owner selects who sees it.**

- `profiles.dtf INTEGER NOT NULL DEFAULT 0` — do I have it.
- `profiles.dtf_scope TEXT NOT NULL DEFAULT 'matches'` with
  `CHECK (dtf_scope IN ('everyone','matches'))` (migration `0004`). When `dtf`
  is 0 the scope is meaningless, which keeps the columns cheap and the UI to a
  switch plus one conditional picker.
- Accepted in `PUT /me/profile`; the server clamps the scope to those two values.
- UI in **Onboarding step 1** and **Me**: a **DTF** switch; when on, a second
  control offering **"Everyone"** / **"Matches only"** (default matches).
- **Enforced server-side, never in the client.** Scope `matches` means the flag
  appears in a payload only when a `matches` row joins viewer and subject.
  Applied to `/discover`, `/likes`, `/profiles/:id` and `/matches`. Scope
  `everyone` always includes it; `dtf = 0` never does.
- Rendered as a badge beside the intent tags on Discover cards, ProfileDetail,
  Likes, and the Matches/Chat list.
- Seed: a mix of `everyone`, `matches` and off, so both paths show in demo data.
- **Play review risk.** Google's sexual-content policy bans lewd content and
  "adult/sexual keywords in the app" ([policy](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en)).
  A plain-text "DTF" badge is not named as a violation and is plausibly fine, but
  it is a genuine rejection risk on Play and carries none on the web build.
  My call: keep the badge strictly text-only — no imagery, no explicit copy —
  and keep a build flag so it can be hidden from the Play package if review
  objects. The feature, the data and the setting stay; only that one badge's
  rendering flips.

### 5. Interests — typed

- Replace the `INTEREST_POOL` bubble grid in `Onboarding.tsx` and `Me.tsx`
  with a text input: type, press **Enter** or comma to add, chip with ✕ to
  remove.
- Caps: 12 items, 30 characters each — **already enforced server-side** by
  `listOf(body.interests, 12, 30)`, so the client only mirrors it.
- No suggestions and no preset pool: the partner explicitly asked for typing.

### 6. "I'm looking for" — wider vocabulary, multi-select

`intent` changes from a single token to a JSON array of up to 4 codes.

| Code | Label |
|---|---|
| `casual` | Something casual |
| `nsa` | No strings attached |
| `fwb` | Friends with benefits |
| `explore` | Exploring what I'm into |
| `kink` | Kink & BDSM |
| `open` | Open / poly / ENM |
| `longterm` | Long-term relationship |
| `friends` | New friends |

- API: `str(body.intent, 20)` becomes `listOf(body.intent, 4, 40)`, validated
  against the code list; 400 "Choose what you are looking for" when empty.
- Migration `0005`: wrap existing single values — `casual` → `["casual"]`,
  `friends` → `["friends"]`, `longterm` → `["longterm"]`.
- Client: `INTENT_LABEL` becomes a code→label map; `Discover.tsx` line 304's
  hardcoded ternary is replaced by mapping the array to badges.
- Seed generator updated to pick 1–3 codes per profile.

---

## Google Play distribution (decided)

The partner chose **Google Play for the APK plus the web app**. That pulls in
Play obligations that split cleanly into code and console work.

**Code:**

- **Privacy & Safety pages** — real routes in the SPA (`/legal/privacy`,
  `/legal/community-standards`), linked from sign-up and the Me screen. Play
  requires a hosted privacy-policy URL in Console **and** a link or text inside
  the app ([User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)),
  and dating apps must publish **Child Safety Standards** — a commitment against
  CSAE, in-app reporting, action on known CSAM, and a designated contact — even
  when built only for adults
  ([Child Safety Standards](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)).
  Report/block/unmatch already exist; this documents them. The safety policy's
  mandatory content is fixed by the Decisions above: **how we verify age
  (self-declaration, no ID collected)** and **how to report abuse, and what
  happens next** — the same two clauses Colorado SB24-011 requires.
- **Data Safety declarations** that must be truthful: email address, photos,
  **approximate** location (city-level counts as ≥3 km²; we never take GPS, so
  it is approximate, not precise), and user-to-user messages
  ([data types](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)).
- **targetSdk 36** — already set; required for new apps and updates from
  2026-08-31.

**Play Console, done by the partner at submission:**

- Enable **Restrict Minor Access** and set the target audience to **18 and over
  as the only age group**. It is a Console feature, not an SDK, and Google says
  an in-app age gate does **not** substitute for it on a core dating app
  ([Age-Restricted Content policy](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en)).
- Category **Dating**; complete the IARC questionnaire — being a dating app does
  not automatically yield an 18+ rating.
- Self-certify Child Safety Standards against a real contact address.
- A **release keystore**, not the auto-generated debug key.
- **Timeline:** a personal account created after 2023-11-13 needs a closed test
  with **12 testers continuously opted in for 14 days** before it may apply for
  production access, then up to about a week of review
  ([testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)).
- **Content risk:** Play bans sexually gratifying content and explicit text.
  The DTF badge is handled in §4; **profile photos must stay non-explicit** or
  the listing fails review — which is also the §2257-adjacent legal exposure
  identified above.

The web build carries none of these constraints, so Play-only mitigations sit
behind build flags rather than server branches.

## Deferred extensions (designed now, built later)

**Platform age signals.** When Google's Age Signals API is generally available —
it is beta today — and Apple's Declared Age Range covers a platform we ship,
request the signal at app start and treat it as an input: an under-18 signal
blocks the account exactly as the age gate does. It is never proof of age and
never replaces the gate. Behind a build flag, off until then, so nothing in the
current build depends on it.

**Vendor-hosted facial age estimation for flagged accounts.** For accounts
reported as possibly underage, a vendor-hosted check returns **pass/fail and
nothing else**. The vendor contract must state that the selfie and any derived
data are deleted and only the result comes back. When we build it, storage is
two columns — `age_check_status TEXT` (`null` | `'pass'` | `'fail'`) and
`age_checked_at TEXT` — with **no column that could hold an image, template or
ID number**, so there is nowhere to put one by accident. I have deliberately
not created those columns in this migration: they belong to the flagged-account
review flow, which is its own feature with its own appeal path.

Choosing that vendor (Yoti, Incode, Persona, k-ID) is a later decision — it
needs a service search and a key from the partner.

## What's left to the builder

- Measure scrypt and PBKDF2 CPU time in workerd; pick the strongest parameters
  that land under ~8 ms; **report the number** and record the OWASP deviation
  in the README.
- Confirm `node:crypto` scrypt exists in workerd before committing to it.
- Confirm the Census gazetteer file downloads and imports at ~33k rows, and that
  the imported size is acceptable for the repo.
- Decide whether the bounding-box query needs a composite index
  `(onboarded, visible, lat, lng)` — measure before adding.
- Keep all 43 existing assertions passing; add the new ones listed below.
- Update `PLAN.md`, `README.md` and `scripts/generate-seed.mjs` to match.

## Test additions (`test/api-test.sh`)

1. Signup → session → `/api/me` 200; signout → 401.
2. Duplicate email rejected; wrong password gives the generic error.
3. Rate limit: 11th failed sign-in within the window returns 429.
4. Password change (or signout-all) invalidates an existing session.
5. Cross-origin `POST /api/auth/signin` with a foreign `Origin` → 403 (writes
   already go through the same-origin check).
6. Typeahead returns results for a partial name; unknown city → 400.
7. `distanceKm=500` with a saved radius of 50 → response `filters.distanceKm`
   is 50, not 500.
8. Swipe at a target beyond the radius → 400; within → succeeds.
9. `/likes` excludes out-of-radius admirers.
10. DTF round-trips through save; with scope `matches` a non-matched viewer's
    payload omits it while a matched viewer's includes it; scope `everyone`
    always includes it.
10b. Change password revokes other sessions; the operator reset script sets a
    working password.
11. Interests: 13 items → 400; a 31-character item → 400.
12. Intent: unknown code → 400; empty array → 400; 5 codes → 400.

## Decisions (answered by the partner, 2026-10-27)

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Pay for a Workers plan if the hash needs it? | **No.** | Hash must fit the free tier's 10 ms CPU; see the decision rule in §1. |
| 2 | Password reset via email? | **No email reset.** | No email dependency. Change-password in Me + an operator reset script instead. |
| 3 | Distribution? | **Google Play + the web app.** | New section above: privacy and community-standards pages, Data Safety declarations, Restrict Minor Access in Console, the 12-tester/14-day gate, and a DTF review risk. |
| 4 | Who sees the DTF badge? | **The user selects.** | `dtf` + `dtf_scope` with server-side filtering, §4. |
| 5 | Age verification | **No ID.** Self-declaration + a published safety policy; platform age signals when generally available; vendor facial age estimation pass/fail for flagged accounts only. | Legal basis §, Deferred extensions, and the safety-policy page under Play distribution. |