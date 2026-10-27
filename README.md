# Spark

Casual dating and encounters for adults 18+ — one codebase, two deliverables:

- **Web app**: React + Vite SPA served by a Cloudflare Worker (Hono) with D1 and R2
- **Android `.apk`**: the same build wrapped in a Capacitor WebView shell

Product scope, architecture and roadmap live in [PLAN.md](PLAN.md).

---

## Quick start

```bash
npm install
npm run db:migrate:local     # create the local D1 schema
npm run db:seed:local        # 114 fictional demo profiles across 38 cities
npm run dev                  # http://localhost:3000 (real worker, real auth)
```

`npm run dev` starts with **sign-in unconfigured** (`FREEBUFF_CLIENT_ID` is
empty), so the app correctly shows its "not configured" screen. To walk through
the whole product without an OIDC round-trip:

```bash
npm run dev:demo             # same UI, API served by the local test harness
```

Then open the browser console and run:

```js
document.cookie = 'test_user=you; path=/'
```

Reload — you get a fresh account: age gate → onboarding → Discover → match → chat.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :3000 with the production Worker |
| `npm run dev:demo` | Dev server wired to `test/harness.ts` (stand-in sign-in) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | `tsc -b` across app, worker and tests |
| `npm test` → `npm run test:api` | 43 end-to-end API assertions against local D1/R2 |
| `npm run db:migrate:local` / `db:seed:local` | Local schema + demo data |
| `npm run seed:generate` | Regenerate `migrations/seed.sql` from `src/cities.json` |
| `npm run icons:generate` | Regenerate PWA icons (no image library needed) |
| `bash scripts/setup-android.sh` | Install JDK 21 + Android SDK into `.tools/` (no root needed) |
| `bash scripts/build-apk.sh` | `cap sync` + Gradle build → `android/app/build/outputs/apk/` |
| `npm run workspace -- "<cmd>"` | Run a command in the persistent Archil workspace disk (needs `ARCHIL_API_KEY`) |

### Persistent workspace (Archil)

Commands and build artifacts normally vanish with the filesystem they ran on.
`npm run workspace` runs a shell command in an [Archil](https://archil.com) disk
instead, so whatever it writes is still there next run:

```bash
export ARCHIL_API_KEY=key-…            # create one at https://archil.com
npm run workspace -- "mkdir -p dumps && npx wrangler d1 export spark --local --output dumps/spark.sql"
npm run workspace -- "ls -la dumps"    # still there, from a different machine if you like
```

The disk is created on first use and reopened by name (`spark-workspace`)
afterwards, so it holds scratch data, database dumps and built artifacts that
you'd rather not commit. `ARCHIL_API_KEY` is an account-level key (it starts
with `key-`), never a disk mount token; declare it in your own `.env` or shell —
[.env.example](.env.example) lists it empty. `disk` is a dev dependency: the
Worker itself keeps using D1 and R2.

---

## Layout

```
src/                     React app (mobile-first)
  screens/               Discover, Likes, Matches, Chat, Profile, Me, Onboarding
  worker/                Hono API: index (auth wrap), api (routes), lib (types)
src/cities.json          City list — shared by the API and the seed generator
migrations/              0001_init.sql, seed.sql (generated)
public/                  manifest.webmanifest, sw.js, icons
test/harness.ts          LOCAL test double for Sign in with Freebuff — never deployed
test/api-test.sh         End-to-end API suite
scripts/                 seed/icon generators, Android toolchain + APK build
android/                 Capacitor Android project (generated)
```

### Request flow

```
browser / WebView ──► Worker (run_worker_first)
                        ├─ /auth/freebuff/*   Sign in with Freebuff sessions
                        ├─ /api/*             session required, same-origin on writes
                        ├─ env.DB   D1        profiles, swipes, matches, messages
                        ├─ env.FILES R2       uploaded photos
                        └─ env.ASSETS         the SPA, with SPA fallback
```

---

## Testing

```bash
npm run build
npm run dev:demo &          # or: wrangler dev --config wrangler.test.jsonc --port 8789
npm test
```

The suite covers: 401s when signed out, 403 on a foreign `Origin`, under-18
rejection, unknown-city rejection, photo magic-byte validation, onboarding
gating, discovery, matching, chat, photo access control, report/block/unblock,
cross-account isolation and account deletion.

`test/harness.ts` mounts the **real** `buildApi()` router; only the session is
faked. It is wired up solely by `wrangler.test.jsonc`, which nothing deploys —
the deploy manifest points at `src/worker/index.ts`.

### What is *not* verified here

- A real OIDC sign-in/callback/sign-out round trip. That needs a public origin,
  so it can only be checked after deploying (see below).
- On-device behaviour of the APK.

---

## PWA

`public/manifest.webmanifest` + `public/sw.js` make the web build installable:
standalone display, portrait lock, 192/512 + maskable icons, offline shell.
The service worker never caches `/api/` or `/auth/` — personal data must not
land in a cache.

Icons are generated by `scripts/make-icons.mjs` through a hand-rolled PNG
encoder, so the project has no image dependency.

---

## Android APK

```bash
bash scripts/setup-android.sh                      # JDK 21 + Android SDK → .tools/
npm run build                                      # dist/client
SPARK_SERVER_URL=https://your-site.example bash scripts/build-apk.sh assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`
(also copied to `artifacts/Spark-debug.apk`).

- `appId` `com.spark.dating`, minSdk 24, targetSdk 36, single `INTERNET` permission
- The shell loads `SPARK_SERVER_URL` rather than bundling the API, so server-side
  fixes ship without an app-store release. Re-run the command above with a
  different origin to repoint it.
- Debug builds are signed with the auto-generated Android debug key. A Play
  Store release needs your own keystore wired into `android/app/build.gradle`.
- `.tools/` is ~800 MB and git-ignored; the toolchain is installed locally
  because this VM has no root.

**The APK currently points at the dev preview origin**, which is only reachable
from the Freebuff client. Repoint it after a real deployment.

---

## Deploying

Not deployed yet — that needs your go-ahead. The path:

1. `sites_create` + `sites_add_storage` (D1 `DB`, R2 `FILES`)
2. `sites_enable_auth` → public `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER`
3. `sites_deploy` with a manifest pointing at `dist/spark/index.js` + `dist/client`
4. Publish the preview environment, then run the full sign-in flow in a browser
5. Rebuild the APK with `SPARK_SERVER_URL=<that origin>`

---

## Safety & compliance

Baked in rather than bolted on:

- **18+ enforced at the API**, not just in the UI — ages below 18 are rejected,
  never silently adjusted.
- **Report / block / unmatch** are server-side; blocks cut both directions and
  deactivate any shared match.
- **Photos are served through the API** with per-request access control, never
  from a public bucket URL; upload validates JPEG/PNG/WebP magic bytes and caps
  at 6 MB, three photos maximum.
- **No device GPS** — distance comes from an explicit city-level location.
- Every write requires a session **and** a same-origin check.
- Seeded demo profiles use generated placeholder artwork; no real person's photo
  appears anywhere.

### Still needed before real users

Phone/OTP sign-up (Freebuff sign-in is right for us, not for your members),
photo moderation, rate limiting, push notifications, an appeals flow, and a
privacy policy / community-guidelines page.
