import { isSameOriginRequest } from '@freebuff/auth'
import CITIES_JSON from '../cities.json'

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  DB: D1Database
  FILES: R2Bucket
  FREEBUFF_CLIENT_ID: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN: string
}

/** Rows of `profiles`. JSON columns are decoded by `decodeProfile`. */
export interface ProfileRow {
  user_id: string
  name: string
  age: number
  gender: string
  city: string
  lat: number | null
  lng: number | null
  bio: string
  intent: string
  seeking: string
  interests: string
  photos: string
  visible: number
  onboarded: number
  age_min: number
  age_max: number
  max_distance_km: number
  demo_auto_like: number
  created_at: string
  updated_at: string
}

export interface Profile
  extends Omit<
    ProfileRow,
    'seeking' | 'interests' | 'photos' | 'visible' | 'onboarded' | 'demo_auto_like' | 'lat' | 'lng'
  > {
  seeking: string[]
  interests: string[]
  photos: string[]
  visible: boolean
  onboarded: boolean
}

export const GENDERS = ['woman', 'man', 'nonbinary'] as const
export const INTENTS = ['casual', 'friends', 'longterm'] as const

const MAX_PHOTO_BYTES = 6 * 1024 * 1024
const MAX_PHOTOS = 3

export { MAX_PHOTO_BYTES, MAX_PHOTOS }

/** Wire row → API shape. `demo_auto_like` is stripped: it is never sent out. */
export function decodeProfile(row: ProfileRow): Profile {
  const {
    seeking,
    interests,
    photos,
    visible,
    onboarded,
    demo_auto_like: _demo,
    lat: _lat,
    lng: _lng,
    ...rest
  } = row
  void _demo
  void _lat
  void _lng
  return {
    ...rest,
    seeking: parseArray(seeking),
    interests: parseArray(interests),
    photos: parseArray(photos),
    visible: visible === 1,
    onboarded: onboarded === 1,
  }
}

export function parseArray(text: unknown): string[] {
  if (typeof text !== 'string') return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * CSRF gate for state-changing requests.
 * `isSameOriginRequest` compares `Origin` against the configured site origin;
 * we additionally accept an `Origin` equal to the origin the request was
 * actually received on, because preview/WebView origins differ from
 * `APP_ORIGIN`. A cross-site page sends its own origin and fails both checks.
 */
export function sameOrigin(request: Request, appOrigin: string): boolean {
  if (isSameOriginRequest(request, appOrigin)) return true
  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') {
    try {
      if (origin === new URL(request.url).origin) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export function newId(): string {
  return crypto.randomUUID()
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** Order-independent match key. */
export function matchPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Coarse, city-level locations. No device GPS is collected in Phase 1. */
export type City = { name: string; lat: number; lng: number }

/** Single source of truth, shared with scripts/generate-seed.mjs. */
export const CITIES: City[] = CITIES_JSON
