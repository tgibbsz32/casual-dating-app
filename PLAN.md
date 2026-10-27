# Spark — casual dating & encounters

A mobile-first dating app delivered as a **web app** (installable PWA) and an **Android `.apk`**.
This document is the source of truth for scope, architecture and sequencing.

---

## 1. Product scope

### Who it's for
Adults (18+) looking for casual dating, hookups, friends-with-benefits, or low-pressure
first dates. Not a marriage app, not a social network.

### MVP feature set (Phase 1 — what we build first)

| Area | Features |
|---|---|
| **Access** | 18+ age gate on first launch, Sign in with Freebuff, sign out |
| **Onboarding** | Display name, age (18+ enforced), gender, city, bio, up to 3 photos, interests, "seeking" tags, intent (Casual / Friends / Long-term) |
| **Discover** | Swipe deck of nearby profiles, like / pass / super-like, age-range and distance filters |
| **Matches** | Mutual like → match, likes-you list, unmatch |
| **Chat** | 1:1 text threads with matches, read receipts, polling updates |
| **Safety** | Report, block, unmatch, hidden profiles, "who can see me" toggle |
| **Me** | View/edit own profile, photo reorder, delete account |

### Deliberately **out** of scope for Phase 1
Video/voice calls, in-app purchases, boost/premium tiers, push notifications, GPS
live-location, algorithmic ranking, social login (Google/Apple), webhooks, admin console.

### Phase 2 — Android packaging
PWA install + Capacitor wrapper producing a signed `.apk`.

### Phase 3 — roadmap
Phone/OTP auth, photo moderation queue, push notifications (FCM), premium tiers
(Stripe), geolocation via browser/device API,举报 appeals flow, rate limiting, analytics.

---

## 2. Key decisions (and why)

1. **One codebase, two targets.** A React SPA + Cloudflare Worker serves the web app;
   Capacitor wraps the *same* build into an Android WebView for the `.apk`. No
   duplicated feature code.
2. **Cloudflare Workers + Hono** for the API instead of Next.js — smaller, no framework
   adapter risk, assets and API on one origin, easy to wrap in Capacitor.
3. **D1 (SQLite)** for relational data (profiles, swipes, matches, messages) and **R2**
   for photo blobs. Both are real, persistent, per-environment stores.
4. **Sign in with Freebuff** for authentication — server-side sessions via
   `@freebuff/auth`, no password handling to get wrong. Consumer apps would normally add
   phone/OTP; that's Phase 3.
5. **Server-driven matching.** All like/pass/match/message writes go through
   authenticated endpoints; the client never decides a match. Photos are uploaded to R2
   through the worker, never trusted from the client.
6. **PWA first, APK second.** The manifest + service worker makes the web build
   installable on Android today; Capacitor then produces a store-loadable `.apk`.

---

## 3. Architecture

```
┌───────────────────────────────┐   ┌──────────────────────────┐
│  React SPA (Vite, TS)         │   │  Capacitor Android壳      │
│  mobile-first, PWA-ready      │──▶│  WebView → same origin    │
└──────────────┬────────────────┘   └──────────────────────────┘
               │ fetch /api/*
┌──────────────▼──────────────────────────────────────────────┐
│  Cloudflare Worker  (Hono)                                  │
│   ├─ /api/auth        sessions (Sign in with Freebuff)      │
│   ├─ /api/profiles    CRUD + photo upload                   │
│   ├─ /api/discover    candidate feed + filters              │
│   ├─ /api/swipes      like / pass / superlike → match       │
│   ├─ /api/matches     list, unmatch                         │
│   ├─ /api/messages     threads + send                       │
│   └─ /api/safety      report / block                        │
│   ├─ env.ASSETS  → static SPA                                │
│   ├─ env.DB (D1)      relational data                       │
│   └─ env.FILES (R2)   photo objects                         │
└─────────────────────────────────────────────────────────────┘
```

### Data model (D1)

```
profiles     id, user_id, name, age, gender, city, bio, intent,
             seeking, interests(JSON), photos(JSON), visible,
             lat, lng, age_min, age_max, max_distance, created_at
swipes       id, swiper_id, target_id, kind('like'|'pass'|'super'), created_at
             UNIQUE(swiper_id, target_id)
matches      id, a_id, b_id, created_at, active
messages     id, match_id, sender_id, body, created_at, read_at
blocks       blocker_id, blocked_id, created_at
reports      id, reporter_id, target_id, reason, details, created_at
sessions     handled by @freebuff/auth (cookie → issuer claims)
```

### Safety & compliance (baked in, not bolted on)
- Hard 18+ gate; `age < 18` rejected at the API, not just the UI.
- Report/block are enforced server-side — blocked users cannot see or message each other.
- Hidden profiles (`visible = 0`) are excluded from every candidate feed.
- Photos served through an authenticated route with per-object access control, not
  public bucket URLs.
- No live GPS stored in Phase 1 — distance is an explicit, coarse city-level field.

---

## 4. Sequencing

1. **Plan** — this file. ✅
2. **Scaffold** — Vite + React + TS + Hono + wrangler, local D1/R2. ✅
3. **Data layer** — migrations, generated seed data (114 profiles / 38 cities). ✅
4. **Auth** — session middleware guarding every `/api/*` route. ✅
5. **API** — profiles → discover → swipes/matches → messages → safety. ✅
6. **UI** — age gate → onboarding → discover → matches → chat → me. ✅
7. **Verify** — local `wrangler dev`, 43 end-to-end API assertions. ✅
8. **PWA** — manifest, generated icons, offline shell. ✅
9. **APK** — local JDK 21 + Android SDK (no root here, so installed under
   `.tools/`), Capacitor project, signed debug build. ✅
10. **Ship** — dev preview and README. ✅  Real Sites deploy: **pending your
   go-ahead**; a browser sign-in round trip and the final APK repoint both
   follow from it.

---

## 5. Known risks

| Risk | Mitigation |
|---|---|
| No root in this VM → no apt Android SDK | Download Temurin JDK + Android cmdline-tools into the workspace; 10 GB free is enough |
| 3 GB RAM / 2 cores → Gradle may be slow | `--no-daemon`, capped heap, build once |
| OAuth sign-in can't complete on a non-public origin | Needs a real Sites preview URL to test in a browser; reported honestly as pending |
| Photo abuse / catfishing | Report + block + moderation queue in Phase 3 |
| Demo profiles return reciprocal likes (`demo_auto_like`) | Demo-only seed behaviour, documented in `migrations/seed.sql` and stripped from every API response |
