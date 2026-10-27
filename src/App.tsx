import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError, api, type City, type MeResponse, type Profile } from './api'
import Chat from './screens/Chat'
import Discover from './screens/Discover'
import Likes from './screens/Likes'
import Me from './screens/Me'
import Matches from './screens/Matches'
import Onboarding from './screens/Onboarding'
import ProfileDetail from './screens/ProfileDetail'
import { ErrorBar, Icons, Spinner, ToastHost, useAsync } from './ui'

const AGE_KEY = 'spark.age.v1'

interface Session {
  user: MeResponse['user']
  profile: Profile | null
  cities: City[]
  refresh: () => Promise<void>
  setProfile: (p: Profile) => void
  unread: number
  setUnread: (n: number) => void
}

const SessionContext = createContext<Session | null>(null)
export function useSession(): Session {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside provider')
  return value
}

export default function App() {
  const [ageOk, setAgeOk] = useState(() => localStorage.getItem(AGE_KEY) === '1')
  const { data, error, loading, reload } = useAsync(() => api.me(), [])
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [unread, setUnread] = useState(0)
  const location = useLocation()

  useEffect(() => {
    setProfileState(data?.profile ?? null)
  }, [data?.profile])

  // Poll match unread counts while the app is open.
  useEffect(() => {
    if (!data?.profile?.onboarded) return
    let live = true
    const tick = async () => {
      try {
        const { matches } = await api.matches()
        if (live) setUnread(matches.reduce((n, m) => n + m.unread, 0))
      } catch {
        /* transient */
      }
    }
    void tick()
    const id = setInterval(tick, 25000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [data?.profile?.onboarded])

  const refresh = useCallback(async () => {
    await reload()
  }, [reload])

  const setProfile = useCallback((p: Profile) => setProfileState(p), [])

  if (!ageOk) return <AgeGate onAccept={() => setAgeOk(true)} />

  if (loading && !data) {
    return (
      <div className="app">
        <div className="screen no-nav">
          <Spinner />
        </div>
      </div>
    )
  }

  if (error) {
    const status = error instanceof ApiError ? error.status : 0
    if (status === 401) return <SignIn />
    if (status === 503) {
      return (
        <div className="app">
          <div className="screen no-nav">
            <div className="brand" style={{ marginBottom: 24 }}>
              <span className="dot" /> Spark
            </div>
            <div className="notice">
              Sign-in isn’t configured for this environment yet. Set <code>FREEBUFF_CLIENT_ID</code> and{' '}
              <code>APP_ORIGIN</code>, then reload.
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="app">
        <div className="screen no-nav">
          <ErrorBar message={error.message} />
          <button className="btn block" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const session: Session = {
    user: data.user,
    profile,
    cities: data.cities,
    refresh,
    setProfile,
    unread,
    setUnread,
  }

  // Profile incomplete → onboarding, everywhere except sign-in.
  if (!profile || !profile.onboarded) {
    return (
      <SessionContext.Provider value={session}>
        <div className="app">
          <Onboarding
            existing={profile}
            cities={data.cities}
            onDone={(p) => {
              setProfile(p)
              void refresh()
            }}
          />
        </div>
        <ToastHost />
      </SessionContext.Provider>
    )
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="app">
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/likes" element={<Likes />} />
          <Route path="/chats" element={<Matches />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/p/:id" element={<ProfileDetail />} />
          <Route path="/me" element={<Me />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
        <ToastHost />
      </div>
    </SessionContext.Provider>
  )
}

function BottomNav() {
  const { unread } = useSession()
  const items = [
    { to: '/', label: 'Discover', icon: Icons.flame, end: true },
    { to: '/likes', label: 'Likes you', icon: Icons.heart },
    { to: '/chats', label: 'Chats', icon: Icons.chat, count: unread },
    { to: '/me', label: 'Me', icon: Icons.user },
  ]
  return (
    <nav className="nav">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {it.icon}
          <span>{it.label}</span>
          {it.count ? <span className="count">{it.count > 9 ? '9+' : it.count}</span> : null}
        </NavLink>
      ))}
    </nav>
  )
}

function AgeGate({ onAccept }: { onAccept: () => void }) {
  const [denied, setDenied] = useState(false)

  if (denied) {
    return (
      <div className="app">
        <div className="hero">
          <div className="logo" />
          <h1>Not yet</h1>
          <p>Spark is for adults 18 and over. Nothing has been saved — you can close this tab.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="hero">
        <div className="logo" />
        <h1>Spark</h1>
        <p>Casual dating, honest intentions. Match with people nearby who want the same thing you do.</p>
        <div className="stack">
          <button
            className="btn block"
            onClick={() => {
              localStorage.setItem(AGE_KEY, '1')
              onAccept()
            }}
          >
            I’m 18 or older — continue
          </button>
          <button className="btn ghost block" onClick={() => setDenied(true)}>
            I’m under 18
          </button>
        </div>
        <p className="legal">
          By continuing you confirm you are 18 or older and agree to our community guidelines: be real, be kind,
          keep it consensual. Accounts found to be under 18 are removed.
        </p>
      </div>
    </div>
  )
}

function SignIn() {
  return (
    <div className="app">
      <div className="hero">
        <div className="logo" />
        <h1>Spark</h1>
        <p>Sign in to build your profile, see who’s around, and start matching.</p>
        <a className="btn block" href="/auth/freebuff/signin?returnTo=/" style={{ textDecoration: 'none' }}>
          Sign in with Freebuff
        </a>
        <p className="legal">
          18+ only. We never post on your behalf and your profile is only visible to other signed-in members.
        </p>
      </div>
    </div>
  )
}
