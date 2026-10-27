export interface Profile {
  user_id: string
  name: string
  age: number
  gender: string
  city: string
  bio: string
  intent: string
  seeking: string[]
  interests: string[]
  photos: string[]
  visible: boolean
  onboarded: boolean
  age_min: number
  age_max: number
  max_distance_km: number
  created_at: string
  updated_at: string
}

export interface ProfileWithDistance extends Profile {
  distance_km: number | null
}

export interface City {
  name: string
  lat: number
  lng: number
}

export interface MeResponse {
  user: { sub: string; name?: string; email?: string; picture?: string }
  profile: Profile | null
  cities: City[]
}

export interface Message {
  id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

export interface MatchSummary {
  id: string
  created_at: string
  profile: Profile | null
  distance_km: number | null
  last_message: { id: string; sender_id: string; body: string; created_at: string } | null
  unread: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const data = await res.json().catch(() => ({}) as T)
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  me: () => request<MeResponse>('/api/me'),

  saveProfile: (body: unknown) =>
    request<{ profile: Profile }>('/api/me/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),

  deleteAccount: () => request<{ ok: boolean }>('/api/me', { method: 'DELETE' }),

  uploadPhoto: async (file: Blob) => {
    const res = await fetch('/api/me/photos', { method: 'POST', credentials: 'same-origin', body: file })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'Upload failed')
    return data as { photos: string[]; onboarded: boolean }
  },

  deletePhoto: (index: number) =>
    request<{ photos: string[]; onboarded: boolean }>(`/api/me/photos/${index}`, { method: 'DELETE' }),

  discover: (params: { ageMin?: number; ageMax?: number; distanceKm?: number; limit?: number }) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v))
    return request<{ profiles: ProfileWithDistance[]; remaining: number; filters: { ageMin: number; ageMax: number; distanceKm: number } }>(
      `/api/discover?${q}`,
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },

  profile: (id: string) =>
    request<{ profile: Profile; distance_km: number | null; my_swipe: string | null }>(`/api/profiles/${encodeURIComponent(id)}`),

  likes: () => request<{ profiles: ProfileWithDistance[] }>('/api/likes'),

  swipe: (targetId: string, kind: 'like' | 'pass' | 'super') =>
    request<{ matched: boolean; kind: string; matchId?: string; profile?: Profile }>(`/api/swipes`, json({ targetId, kind })),

  matches: () => request<{ matches: MatchSummary[] }>('/api/matches'),

  messages: (matchId: string) => request<{ messages: Message[] }>(`/api/matches/${matchId}/messages`),

  sendMessage: (matchId: string, body: string) =>
    request<{ message: Message }>(`/api/matches/${matchId}/messages`, json({ body })),

  markRead: (matchId: string) => request<{ ok: boolean }>(`/api/matches/${matchId}/read`, json({})),

  unmatch: (matchId: string) => request<{ ok: boolean }>(`/api/matches/${matchId}`, { method: 'DELETE' }),

  report: (targetId: string, reason: string, details: string) =>
    request<{ ok: boolean }>('/api/safety/report', json({ targetId, reason, details })),

  block: (targetId: string) => request<{ ok: boolean }>('/api/safety/block', json({ targetId })),

  blocks: () => request<{ blocks: { user_id: string; created_at: string; profile: Profile | null }[] }>('/api/safety/blocks'),

  unblock: (userId: string) => request<{ ok: boolean }>(`/api/safety/blocks/${userId}`, { method: 'DELETE' }),
}

export function photoUrl(userId: string, key: string): string {
  return `/api/photo?u=${encodeURIComponent(userId)}&k=${encodeURIComponent(key)}`
}

export function photoSrc(profile: Profile, index = 0): string | null {
  const key = profile.photos[index]
  return key ? photoUrl(profile.user_id, key) : null
}

export const INTENT_LABEL: Record<string, string> = {
  casual: 'Something casual',
  friends: 'New friends',
  longterm: 'Long-term',
}

export const GENDER_LABEL: Record<string, string> = {
  woman: 'Woman',
  man: 'Man',
  nonbinary: 'Non-binary',
}
