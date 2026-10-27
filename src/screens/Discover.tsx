import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, photoSrc, type ProfileWithDistance } from '../api'
import { useSession } from '../App'
import { Empty, ErrorBar, Icons, Sheet, Spinner, toast, useAsync } from '../ui'

const COMMIT = 105

export default function Discover() {
  const { profile, setUnread } = useSession()
  const navigate = useNavigate()

  const [ageMin, setAgeMin] = useState(profile?.age_min ?? 18)
  const [ageMax, setAgeMax] = useState(profile?.age_max ?? 60)
  const [distanceKm, setDistance] = useState(profile?.max_distance_km ?? 100)
  const [showFilters, setShowFilters] = useState(false)
  const [applied, setApplied] = useState(0)
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState({ x: 0, y: 0, down: false })
  const [match, setMatch] = useState<{ id: string; profile: ProfileWithDistance } | null>(null)
  const [busy, setBusy] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, moved: false })

  const { data, error, loading, reload } = useAsync(
    () => api.discover({ ageMin, ageMax, distanceKm, limit: 30 }),
    [applied],
  )

  const deck = data?.profiles ?? []
  const current = deck[index] ?? null
  const next = deck[index + 1] ?? null

  const act = useCallback(
    async (kind: 'like' | 'pass' | 'super') => {
      if (!current || busy) return
      setBusy(true)
      try {
        const res = await api.swipe(current.user_id, kind)
        setIndex((i) => i + 1)
        setDrag({ x: 0, y: 0, down: false })
        if (res.matched && res.matchId && res.profile) {
          setMatch({ id: res.matchId, profile: { ...res.profile, distance_km: current.distance_km } })
          void api.matches().then((r) => setUnread(r.matches.reduce((n, m) => n + m.unread, 0))).catch(() => undefined)
        } else if (kind !== 'pass') {
          toast(kind === 'super' ? 'Super like sent' : 'Liked')
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not send')
      } finally {
        setBusy(false)
      }
    },
    [current, busy, setUnread],
  )

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (match) return
      if (e.key === 'ArrowLeft') void act('pass')
      if (e.key === 'ArrowRight') void act('like')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [act, match])

  const onDown = (e: React.PointerEvent) => {
    if (!current) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false }
    setDrag({ x: 0, y: 0, down: true })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag.down) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragRef.current.moved = true
    setDrag({ x: dx, y: dy, down: true })
  }

  const onUp = () => {
    if (!drag.down) return
    const dx = drag.x
    setDrag({ x: 0, y: 0, down: false })
    if (dx > COMMIT) void act('like')
    else if (dx < -COMMIT) void act('pass')
  }

  const openProfile = () => {
    if (dragRef.current.moved) return
    if (current) navigate(`/p/${current.user_id}`)
  }

  if (loading) return <div className="screen"><Spinner /></div>

  if (error) {
    return (
      <div className="screen">
        <TopBar onFilter={() => setShowFilters(true)} />
        <div className="error-bar">{error.message}</div>
        <button className="btn block" onClick={() => void reload()}>Try again</button>
      </div>
    )
  }

  return (
    <div className="screen">
      <TopBar onFilter={() => setShowFilters(true)} />

      {current ? (
        <>
          <div className="deck">
            {next ? (
              <div className="slot behind">
                <CardPhoto profile={next} />
                <CardInfo profile={next} />
              </div>
            ) : null}
            <div
              className="slot"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              style={{
                transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 16}deg)`,
                cursor: drag.down ? 'grabbing' : 'grab',
                zIndex: 2,
              }}
            >
              <CardPhoto profile={current} />
              <div className="dots">
                {current.photos.map((_, i) => (
                  <i key={i} className={i === 0 ? 'on' : ''} />
                ))}
              </div>
              <div className="stamp like" style={{ opacity: Math.max(0, Math.min(1, drag.x / COMMIT)) }}>Like</div>
              <div className="stamp nope" style={{ opacity: Math.max(0, Math.min(1, -drag.x / COMMIT)) }}>Nope</div>
              <CardInfo profile={current} />
              <div
                onClick={openProfile}
                style={{ position: 'absolute', inset: 0, bottom: 140 }}
                aria-hidden
              />
            </div>
          </div>

          <div className="actions">
            <button className="round" onClick={() => void act('pass')} aria-label="Pass">
              {Icons.x}
            </button>
            <button className="round sm" onClick={() => void act('super')} aria-label="Super like" style={{ color: 'var(--blue)' }}>
              {Icons.star}
            </button>
            <button className="round big" onClick={() => void act('like')} aria-label="Like" style={{ color: '#fff' }}>
              {Icons.heart}
            </button>
          </div>

          <p className="tiny muted center" style={{ marginTop: 14 }}>
            Swipe right to like, left to pass · tap the photo for their full profile
          </p>
        </>
      ) : (
        <>
          <Empty
            icon="🌙"
            title="You’ve seen everyone nearby"
            hint="Widen your age range or distance to see more people."
          />
          <button className="btn block" onClick={() => setShowFilters(true)}>
            Adjust filters
          </button>
        </>
      )}

      {showFilters ? (
        <Sheet title="Filters" onClose={() => setShowFilters(false)}>
          <div className="field">
            <label>Age range</label>
            <div className="row">
              <input
                className="input"
                inputMode="numeric"
                value={ageMin}
                onChange={(e) => setAgeMin(Math.max(18, Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 18))}
              />
              <span className="muted">to</span>
              <input
                className="input"
                inputMode="numeric"
                value={ageMax}
                onChange={(e) => setAgeMax(Math.max(18, Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 18))}
              />
            </div>
          </div>

          <div className="field">
            <label>Maximum distance · {distanceKm} km</label>
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={distanceKm}
              onChange={(e) => setDistance(Number(e.target.value))}
            />
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button
              className="btn ghost"
              onClick={() => {
                setAgeMin(18)
                setAgeMax(60)
                setDistance(100)
              }}
            >
              Reset
            </button>
            <button
              className="btn grow"
              onClick={() => {
                if (ageMin > ageMax) {
                  const a = ageMin
                  setAgeMin(ageMax)
                  setAgeMax(a)
                }
                setApplied((n) => n + 1)
                setIndex(0)
                setShowFilters(false)
              }}
            >
              Apply
            </button>
          </div>
        </Sheet>
      ) : null}

      {match ? (
        <div className="match-overlay">
          <h2>It’s a match!</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            You and {match.profile.name} liked each other.
          </p>
          <div className="avs">
            <img src={photoSrc(match.profile) ?? ''} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <img src={photoSrc(profile!) ?? ''} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
          <div className="stack" style={{ width: '100%', maxWidth: 300 }}>
            <button className="btn block" onClick={() => navigate(`/chat/${match.id}`)}>
              Send a message
            </button>
            <button className="btn ghost block" onClick={() => setMatch(null)}>
              Keep swiping
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TopBar({ onFilter }: { onFilter: () => void }) {
  return (
    <div className="topbar">
      <span className="dot" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--grad)' }} />
      <h1>
        Discover
        <div className="sub">Nearby people looking for the same thing</div>
      </h1>
      <button className="btn ghost sm" onClick={onFilter}>
        Filters
      </button>
    </div>
  )
}

function CardPhoto({ profile }: { profile: ProfileWithDistance }) {
  const src = photoSrc(profile)
  return src ? (
    <img className="photo" src={src} alt={profile.name} draggable={false} />
  ) : (
    <div className="photo" style={{ display: 'grid', placeItems: 'center', fontSize: 56, color: 'var(--muted)' }}>
      {profile.name.slice(0, 1)}
    </div>
  )
}

function CardInfo({ profile }: { profile: ProfileWithDistance }) {
  return (
    <>
      <div className="shade" />
      <div className="info">
        <div className="nm">
          {profile.name} <span>{profile.age}</span>
        </div>
        <div className="meta">
          {profile.city}
          {profile.distance_km != null ? ` · ${profile.distance_km} km away` : ''}
        </div>
        <div className="bio">{profile.bio}</div>
        <div className="tags">
          <span className="tag">{profile.intent === 'casual' ? 'Something casual' : profile.intent === 'friends' ? 'New friends' : 'Long-term'}</span>
          {profile.interests.slice(0, 3).map((i) => (
            <span className="tag" key={i}>
              {i}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
