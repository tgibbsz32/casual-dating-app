import { Hono } from 'hono'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import {
  CITIES,
  GENDERS,
  INTENTS,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  clampInt,
  decodeProfile,
  haversineKm,
  jsonError,
  matchPair,
  newId,
  parseArray,
  sameOrigin,
  type Env,
  type Profile,
  type ProfileRow,
} from './lib'

type Vars = { user: FreebuffUser }
type App = Hono<{ Bindings: Env; Variables: Vars }>

const REPORT_REASONS = ['fake', 'harassment', 'nudity', 'spam', 'underage', 'other'] as const

interface PutProfileBody {
  name?: unknown
  age?: unknown
  gender?: unknown
  city?: unknown
  bio?: unknown
  intent?: unknown
  seeking?: unknown
  interests?: unknown
  visible?: unknown
  ageMin?: unknown
  ageMax?: unknown
  maxDistanceKm?: unknown
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function listOf(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const raw of v) {
    if (typeof raw !== 'string') continue
    const s = raw.trim().slice(0, maxLen)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= maxItems) break
  }
  return out
}

function onboarded(row: {
  name: string
  age: number
  gender: string
  city: string
  bio: string
  seeking: string[]
  photoCount: number
}): number {
  return row.name && row.age >= 18 && row.gender && row.city && row.bio && row.seeking.length > 0 && row.photoCount > 0
    ? 1
    : 0
}

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function sniffImage(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
  if (type === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (type === 'image/webp') return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45
  return false
}

/** Blocks in either direction — nobody who blocked me is reachable. */
const NOT_BLOCKED = `
  AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
  AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)`

export function buildApi(auth: FreebuffAuth): App {
  const api = new Hono<{ Bindings: Env; Variables: Vars }>()

  // ── middleware ──────────────────────────────────────────────────────────
  api.use('*', async (c, next) => {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (!sameOrigin(c.req.raw, c.env.APP_ORIGIN)) {
        return jsonError(403, 'Cross-origin request rejected')
      }
    }
    const user = await auth.getUser(c.req.raw)
    if (!user) return jsonError(401, 'Sign in required')
    c.set('user', user)
    await next()
  })

  const me = (c: any): FreebuffUser => c.get('user') as FreebuffUser

  async function loadProfile(env: Env, userId: string): Promise<ProfileRow | null> {
    return (await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first<ProfileRow>()) ?? null
  }

  // ── me / profile ───────────────────────────────────────────────────────
  api.get('/me', async (c) => {
    const u = me(c)
    const row = await loadProfile(c.env, u.sub)
    return c.json(
      { user: u, profile: row ? decodeProfile(row) : null, cities: CITIES },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  })

  api.put('/me/profile', async (c) => {
    const u = me(c)
    let body: PutProfileBody
    try {
      body = await c.req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const name = str(body.name, 40)
    const ageRaw = Number.parseInt(String(body.age ?? ''), 10)
    const ageValid = Number.isInteger(ageRaw) && ageRaw >= 18 && ageRaw <= 120
    const gender = str(body.gender, 20)
    const city = str(body.city, 60)
    const bio = str(body.bio, 600)
    const intent = str(body.intent, 20)
    const seeking = listOf(body.seeking, 4, 20)
    const interests = listOf(body.interests, 12, 30)

    if (!name) return jsonError(400, 'Display name is required')
    if (!ageValid) return jsonError(400, 'You must be 18 or older to use Spark')
    const age = ageRaw
    if (!(GENDERS as readonly string[]).includes(gender)) return jsonError(400, 'Choose a gender')
    const place = CITIES.find((cty) => cty.name === city)
    if (!place) return jsonError(400, 'Choose a city from the list')
    if (!bio) return jsonError(400, 'Write a short bio')
    if (!seeking.length) return jsonError(400, 'Choose who you want to see')
    if (!(INTENTS as readonly string[]).includes(intent)) return jsonError(400, 'Choose what you are looking for')

    const ageMin = clampInt(body.ageMin, 18, 120, 18)
    const ageMax = clampInt(body.ageMax, 18, 120, 60)
    const maxDistanceKm = clampInt(body.maxDistanceKm, 1, 500, 100)
    const visible = body.visible === false ? 0 : 1

    const existing = await loadProfile(c.env, u.sub)
    const photos = existing ? existing.photos : '[]'
    const photoCount = parseArray(photos).length
    const isOnboarded = onboarded({ name, age, gender, city, bio, seeking, photoCount })

    await c.env.DB.prepare(
      `INSERT INTO profiles
         (user_id, name, age, gender, city, lat, lng, bio, intent, seeking, interests,
          photos, visible, onboarded, age_min, age_max, max_distance_km, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(user_id) DO UPDATE SET
         name=excluded.name, age=excluded.age, gender=excluded.gender, city=excluded.city,
         lat=excluded.lat, lng=excluded.lng, bio=excluded.bio, intent=excluded.intent,
         seeking=excluded.seeking, interests=excluded.interests, visible=excluded.visible,
         onboarded=excluded.onboarded, age_min=excluded.age_min, age_max=excluded.age_max,
         max_distance_km=excluded.max_distance_km,
         updated_at=excluded.updated_at`,
    )
      .bind(
        u.sub,
        name,
        age,
        gender,
        city,
        place.lat,
        place.lng,
        bio,
        intent,
        JSON.stringify(seeking),
        JSON.stringify(interests),
        photos,
        visible,
        isOnboarded,
        Math.min(ageMin, ageMax),
        Math.max(ageMin, ageMax),
        maxDistanceKm,
      )
      .run()

    const row = await loadProfile(c.env, u.sub)
    return c.json({ profile: row ? decodeProfile(row) : null })
  })

  api.delete('/me', async (c) => {
    const u = me(c)
    const db = c.env.DB
    const photos = (await loadProfile(c.env, u.sub))?.photos
    await db.batch([
      db.prepare('UPDATE matches SET active = 0 WHERE member_low = ? OR member_high = ?').bind(u.sub, u.sub),
      db.prepare('DELETE FROM swipes WHERE swiper_id = ? OR target_id = ?').bind(u.sub, u.sub),
      db.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').bind(u.sub, u.sub),
      db.prepare('DELETE FROM reports WHERE reporter_id = ? OR target_id = ?').bind(u.sub, u.sub),
      db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(u.sub),
    ])
    for (const key of parseArray(photos)) {
      await c.env.FILES.delete(key).catch(() => undefined)
    }
    return c.json({ ok: true })
  })

  // ── photos ─────────────────────────────────────────────────────────────
  api.post('/me/photos', async (c) => {
    const u = me(c)
    const row = await loadProfile(c.env, u.sub)
    if (!row) return jsonError(400, 'Save your details before adding photos')

    const photos = parseArray(row.photos)
    if (photos.length >= MAX_PHOTOS) return jsonError(400, `You can add up to ${MAX_PHOTOS} photos`)

    const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = IMAGE_TYPES[type]
    if (!ext) return jsonError(415, 'Upload a JPEG, PNG or WebP image')

    const buffer = new Uint8Array(await c.req.arrayBuffer())
    if (!buffer.byteLength) return jsonError(400, 'Empty upload')
    if (buffer.byteLength > MAX_PHOTO_BYTES) return jsonError(413, 'Photo must be under 6 MB')
    if (!sniffImage(buffer, type)) return jsonError(415, 'That file is not a real image')

    const key = `photos/${u.sub}/${newId()}.${ext}`
    await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: type } })
    photos.push(key)

    const nextOnboarded = onboarded({
      name: row.name,
      age: row.age,
      gender: row.gender,
      city: row.city,
      bio: row.bio,
      seeking: parseArray(row.seeking),
      photoCount: photos.length,
    })
    await c.env.DB.prepare(
      "UPDATE profiles SET photos = ?, onboarded = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?",
    )
      .bind(JSON.stringify(photos), nextOnboarded, u.sub)
      .run()

    return c.json({ photos, onboarded: nextOnboarded === 1 }, 201)
  })

  api.delete('/me/photos/:index', async (c) => {
    const u = me(c)
    const index = Number.parseInt(c.req.param('index'), 10)
    const row = await loadProfile(c.env, u.sub)
    if (!row) return jsonError(404, 'No profile')
    const photos = parseArray(row.photos)
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return jsonError(404, 'No such photo')

    const [removed] = photos.splice(index, 1)
    await c.env.FILES.delete(removed).catch(() => undefined)
    const nextOnboarded = onboarded({
      name: row.name,
      age: row.age,
      gender: row.gender,
      city: row.city,
      bio: row.bio,
      seeking: parseArray(row.seeking),
      photoCount: photos.length,
    })
    await c.env.DB.prepare(
      "UPDATE profiles SET photos = ?, onboarded = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?",
    )
      .bind(JSON.stringify(photos), nextOnboarded, u.sub)
      .run()

    return c.json({ photos, onboarded: nextOnboarded === 1 })
  })

  /** Seeded demo profiles use generated placeholder artwork instead of photos. */
  function seedArtwork(key: string): Response {
    const parts = key.split('/')
    const idx = Number.parseInt(parts[2] ?? '0', 10) || 0
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    const hue = (h + idx * 47) % 360
    const hue2 = (hue + 38) % 360
    const tilt = ((h % 5) - 2) * 10
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 72% 58%)"/><stop offset="1" stop-color="hsl(${hue2} 68% 32%)"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><g transform="translate(${tilt} 0)"><circle cx="300" cy="296" r="118" fill="rgba(255,255,255,.26)"/><path d="M110 800c0-132 86-214 190-214s190 82 190 214z" fill="rgba(255,255,255,.26)"/></g><circle cx="300" cy="400" r="252" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/></svg>`
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
    })
  }

  /** Photos are served through the API, never from a public bucket URL. */
  api.get('/photo', async (c) => {
    const u = me(c)
    const owner = c.req.query('u') ?? ''
    const key = c.req.query('k') ?? ''
    const allowed = owner && key && (key.startsWith(`photos/${owner}/`) || key.startsWith(`seed/${owner}/`))
    if (!allowed) return jsonError(404, 'Not found')

    const blocked =
      owner !== u.sub &&
      (await c.env.DB.prepare(
        `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      )
        .bind(owner, u.sub, u.sub, owner)
        .first()) !== null
    if (blocked) return jsonError(403, 'Not available')

    if (key.startsWith('seed/')) return seedArtwork(key)

    const object = await c.env.FILES.get(key)
    if (!object) return jsonError(404, 'Not found')
    const headers = new Headers({
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    })
    return new Response(object.body, { headers })
  })

  // ── other people's profiles ───────────────────────────────────────────
  api.get('/profiles/:id', async (c) => {
    const u = me(c)
    const id = c.req.param('id')
    if (!id || id === u.sub) return jsonError(404, 'Profile not found')

    const row = await loadProfile(c.env, id)
    if (!row || !row.onboarded) return jsonError(404, 'Profile not found')

    const blocked = await c.env.DB.prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    )
      .bind(u.sub, id, id, u.sub)
      .first()
    if (blocked) return jsonError(404, 'Profile not found')

    const mine = await loadProfile(c.env, u.sub)
    const mineRow = mine ?? row
    const swipe = await c.env.DB.prepare('SELECT kind FROM swipes WHERE swiper_id = ? AND target_id = ?')
      .bind(u.sub, id)
      .first<{ kind: string }>()

    return c.json(
      {
        profile: decodeProfile(row),
        distance_km: distanceOf(mineRow, row),
        my_swipe: swipe?.kind ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  })

  // ── discover ───────────────────────────────────────────────────────────
  function distanceOf(a: ProfileRow, b: ProfileRow): number | null {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
    return Math.round(haversineKm([a.lat, a.lng], [b.lat, b.lng]))
  }

  function withDistance(meRow: ProfileRow, rows: ProfileRow[]) {
    return rows.map((row) => ({ ...decodeProfile(row), distance_km: distanceOf(meRow, row) }))
  }

  api.get('/discover', async (c) => {
    const u = me(c)
    const mine = await loadProfile(c.env, u.sub)
    if (!mine) return jsonError(400, 'Create your profile first')
    if (!mine.onboarded) return jsonError(409, 'Finish your profile to start discovering')

    const ageMin = clampInt(c.req.query('ageMin'), 18, 120, mine.age_min)
    const ageMax = clampInt(c.req.query('ageMax'), 18, 120, mine.age_max)
    const distanceKm = clampInt(c.req.query('distanceKm'), 1, 500, mine.max_distance_km)
    const limit = clampInt(c.req.query('limit'), 1, 50, 20)

    const lo = Math.min(ageMin, ageMax)
    const hi = Math.max(ageMin, ageMax)

    const candidates = await c.env.DB.prepare(
      `SELECT p.* FROM profiles p
        WHERE p.user_id != ?
          AND p.onboarded = 1
          AND p.visible = 1
          AND p.age >= ? AND p.age <= ?
          AND json_array_length(p.photos) > 0
          AND p.user_id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
          ${NOT_BLOCKED}
        ORDER BY RANDOM()
        LIMIT 80`,
    )
      .bind(u.sub, lo, hi, u.sub, u.sub, u.sub)
      .all<ProfileRow>()

    const myGender = mine.gender
    const mySeeking = parseArray(mine.seeking)
    const theirSeeking = (row: ProfileRow) => parseArray(row.seeking)

    const filtered = candidates.results.filter((row) => {
      if (!mySeeking.includes(row.gender)) return false
      if (!theirSeeking(row).includes(myGender)) return false
      const d = distanceOf(mine, row)
      if (d != null && d > distanceKm) return false
      return true
    })

    const remaining = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM profiles p
        WHERE p.user_id != ? AND p.onboarded = 1 AND p.visible = 1
          AND p.user_id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
          ${NOT_BLOCKED}`,
    )
      .bind(u.sub, u.sub, u.sub, u.sub)
      .first<{ n: number }>()

    return c.json(
      {
        profiles: withDistance(mine, filtered.slice(0, limit)),
        remaining: remaining?.n ?? 0,
        filters: { ageMin: lo, ageMax: hi, distanceKm },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  })

  api.get('/likes', async (c) => {
    const u = me(c)
    const mine = await loadProfile(c.env, u.sub)
    if (!mine) return jsonError(400, 'Create your profile first')

    const rows = await c.env.DB.prepare(
      `SELECT p.* FROM profiles p
        WHERE p.user_id != ? AND p.onboarded = 1 AND p.visible = 1
          AND p.user_id IN (SELECT swiper_id FROM swipes WHERE target_id = ? AND kind IN ('like','super'))
          AND p.user_id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
          ${NOT_BLOCKED}
        ORDER BY p.created_at DESC
        LIMIT 50`,
    )
      .bind(u.sub, u.sub, u.sub, u.sub, u.sub)
      .all<ProfileRow>()

    return c.json(
      { profiles: withDistance(mine, rows.results) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  })

  // ── swipes → matches ───────────────────────────────────────────────────
  async function createMatch(env: Env, a: string, b: string): Promise<string> {
    const [low, high] = matchPair(a, b)
    const existing = await env.DB.prepare('SELECT id FROM matches WHERE member_low = ? AND member_high = ?')
      .bind(low, high)
      .first<{ id: string }>()
    if (existing) return existing.id
    const id = newId()
    await env.DB.prepare('INSERT INTO matches (id, member_low, member_high) VALUES (?,?,?)').bind(id, low, high).run()
    return id
  }

  api.post('/swipes', async (c) => {
    const u = me(c)
    let body: { targetId?: unknown; kind?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const targetId = typeof body.targetId === 'string' ? body.targetId : ''
    const kind = typeof body.kind === 'string' ? body.kind : ''
    if (!targetId || targetId === u.sub) return jsonError(400, 'Invalid target')
    if (!['like', 'pass', 'super'].includes(kind)) return jsonError(400, 'Invalid action')

    const target = await loadProfile(c.env, targetId)
    if (!target || !target.onboarded || !target.visible) return jsonError(404, 'Profile not available')

    const blocked = await c.env.DB.prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    )
      .bind(u.sub, targetId, targetId, u.sub)
      .first()
    if (blocked) return jsonError(403, 'Not available')

    await c.env.DB.prepare(
      'INSERT INTO swipes (swiper_id, target_id, kind) VALUES (?,?,?) ON CONFLICT(swiper_id, target_id) DO UPDATE SET kind = excluded.kind, created_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',
    )
      .bind(u.sub, targetId, kind)
      .run()

    if (kind === 'pass') return c.json({ matched: false, kind })

    // Did they already like me?
    const theirs = await c.env.DB.prepare(
      "SELECT kind FROM swipes WHERE swiper_id = ? AND target_id = ?",
    )
      .bind(targetId, u.sub)
      .first<{ kind: string }>()

    let matched = Boolean(theirs && theirs.kind !== 'pass')

    // Demo seed profiles like back so a fresh visitor sees a real match.
    if (!matched && target.demo_auto_like === 1) {
      await c.env.DB.prepare(
        'INSERT INTO swipes (swiper_id, target_id, kind) VALUES (?,?,?) ON CONFLICT(swiper_id, target_id) DO NOTHING',
      )
        .bind(targetId, u.sub, kind)
        .run()
      matched = true
    }

    if (!matched) return c.json({ matched: false, kind })

    const matchId = await createMatch(c.env, u.sub, targetId)
    return c.json({ matched: true, kind, matchId, profile: decodeProfile(target) })
  })

  // ── matches ────────────────────────────────────────────────────────────
  interface MatchRow {
    id: string
    member_low: string
    member_high: string
    active: number
    created_at: string
  }

  async function activeMatch(env: Env, matchId: string, userId: string): Promise<MatchRow | null> {
    const row = await env.DB.prepare('SELECT * FROM matches WHERE id = ? AND active = 1').bind(matchId).first<MatchRow>()
    if (!row) return null
    return row.member_low === userId || row.member_high === userId ? row : null
  }

  api.get('/matches', async (c) => {
    const u = me(c)
    const rows = await c.env.DB.prepare(
      'SELECT * FROM matches WHERE active = 1 AND (member_low = ? OR member_high = ?) ORDER BY created_at DESC',
    )
      .bind(u.sub, u.sub)
      .all<MatchRow>()
    const mine = await loadProfile(c.env, u.sub)

    const out = []
    for (const m of rows.results) {
      const other = m.member_low === u.sub ? m.member_high : m.member_low
      const profile = await loadProfile(c.env, other)
      const [last, unread] = await c.env.DB.batch([
        c.env.DB.prepare(
          'SELECT id, sender_id, body, created_at FROM messages WHERE match_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
        ).bind(m.id),
        c.env.DB.prepare(
          'SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id != ? AND read_at IS NULL',
        ).bind(m.id, u.sub),
      ])
      const unreadCount = (unread as { results?: { n: number }[] })?.results?.[0]?.n ?? 0
      out.push({
        id: m.id,
        created_at: m.created_at,
        profile: profile ? decodeProfile(profile) : null,
        distance_km: profile && mine ? distanceOf(profile, mine) : null,
        last_message: (last as { results?: unknown[] })?.results?.[0] ?? null,
        unread: unreadCount,
      })
    }
    return c.json({ matches: out }, { headers: { 'Cache-Control': 'private, no-store' } })
  })

  api.delete('/matches/:id', async (c) => {
    const u = me(c)
    const m = await activeMatch(c.env, c.req.param('id'), u.sub)
    if (!m) return jsonError(404, 'Match not found')
    await c.env.DB.prepare('UPDATE matches SET active = 0 WHERE id = ?').bind(m.id).run()
    return c.json({ ok: true })
  })

  // ── messages ───────────────────────────────────────────────────────────
  api.get('/matches/:id/messages', async (c) => {
    const u = me(c)
    const m = await activeMatch(c.env, c.req.param('id'), u.sub)
    if (!m) return jsonError(404, 'Match not found')
    const limit = clampInt(c.req.query('limit'), 1, 300, 200)
    const rows = await c.env.DB.prepare(
      'SELECT id, sender_id, body, created_at, read_at FROM messages WHERE match_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
      .bind(m.id, limit)
      .all()
    return c.json({ messages: rows.results.reverse() }, { headers: { 'Cache-Control': 'private, no-store' } })
  })

  api.post('/matches/:id/messages', async (c) => {
    const u = me(c)
    const m = await activeMatch(c.env, c.req.param('id'), u.sub)
    if (!m) return jsonError(404, 'Match not found')

    let body: { body?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }
    const text = str(body.body, 1000)
    if (!text) return jsonError(400, 'Message cannot be empty')

    const id = newId()
    const row = await c.env.DB.prepare(
      `INSERT INTO messages (id, match_id, sender_id, body)
       VALUES (?,?,?,?) RETURNING id, sender_id, body, created_at, read_at`,
    )
      .bind(id, m.id, u.sub, text)
      .first()
    return c.json({ message: row }, 201)
  })

  api.post('/matches/:id/read', async (c) => {
    const u = me(c)
    const m = await activeMatch(c.env, c.req.param('id'), u.sub)
    if (!m) return jsonError(404, 'Match not found')
    await c.env.DB.prepare(
      "UPDATE messages SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE match_id = ? AND sender_id != ? AND read_at IS NULL",
    )
      .bind(m.id, u.sub)
      .run()
    return c.json({ ok: true })
  })

  // ── safety ─────────────────────────────────────────────────────────────
  api.post('/safety/report', async (c) => {
    const u = me(c)
    let body: { targetId?: unknown; reason?: unknown; details?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }
    const targetId = typeof body.targetId === 'string' ? body.targetId : ''
    const reason = typeof body.reason === 'string' ? body.reason : ''
    if (!targetId || targetId === u.sub) return jsonError(400, 'Invalid target')
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) return jsonError(400, 'Choose a reason')
    if (!(await loadProfile(c.env, targetId))) return jsonError(404, 'Profile not found')

    await c.env.DB.prepare('INSERT INTO reports (id, reporter_id, target_id, reason, details) VALUES (?,?,?,?,?)')
      .bind(newId(), u.sub, targetId, reason, str(body.details, 500))
      .run()
    return c.json({ ok: true }, 201)
  })

  api.post('/safety/block', async (c) => {
    const u = me(c)
    let body: { targetId?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }
    const targetId = typeof body.targetId === 'string' ? body.targetId : ''
    if (!targetId || targetId === u.sub) return jsonError(400, 'Invalid target')

    const [low, high] = matchPair(u.sub, targetId)
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?,?) ON CONFLICT DO NOTHING').bind(
        u.sub,
        targetId,
      ),
      c.env.DB.prepare('UPDATE matches SET active = 0 WHERE member_low = ? AND member_high = ?').bind(low, high),
      c.env.DB.prepare('DELETE FROM swipes WHERE (swiper_id = ? AND target_id = ?) OR (swiper_id = ? AND target_id = ?)').bind(
        u.sub,
        targetId,
        targetId,
        u.sub,
      ),
    ])
    return c.json({ ok: true })
  })

  api.get('/safety/blocks', async (c) => {
    const u = me(c)
    const rows = await c.env.DB.prepare(
      'SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC',
    )
      .bind(u.sub)
      .all<{ blocked_id: string; created_at: string }>()
    const out = []
    for (const r of rows.results) {
      const profile = await loadProfile(c.env, r.blocked_id)
      out.push({ user_id: r.blocked_id, created_at: r.created_at, profile: profile ? decodeProfile(profile) : null })
    }
    return c.json({ blocks: out }, { headers: { 'Cache-Control': 'private, no-store' } })
  })

  api.delete('/safety/blocks/:id', async (c) => {
    const u = me(c)
    await c.env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?')
      .bind(u.sub, c.req.param('id'))
      .run()
    return c.json({ ok: true })
  })

  api.notFound((c) => jsonError(404, 'Unknown API route'))
  api.onError((err) => {
    console.error('api error', err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err))
    return jsonError(500, 'Something went wrong')
  })

  return api
}
