import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, GENDER_LABEL, INTENT_LABEL, photoSrc } from '../api'
import { useSession } from '../App'
import { Confirm, ErrorBar, Icons, Sheet, Spinner, toast, useAsync } from '../ui'

const REPORT_REASONS: [string, string][] = [
  ['fake', 'Fake profile'],
  ['harassment', 'Harassment'],
  ['nudity', 'Nudity'],
  ['spam', 'Spam'],
  ['underage', 'Under 18'],
  ['other', 'Something else'],
]

export default function ProfileDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useSession()

  const [photo, setPhoto] = useState(0)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('fake')
  const [details, setDetails] = useState('')
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [acting, setActing] = useState(false)

  const { data, error, loading, reload } = useAsync(() => api.profile(id), [id])

  const act = async (kind: 'like' | 'pass' | 'super') => {
    if (acting) return
    setActing(true)
    try {
      const res = await api.swipe(id, kind)
      if (res.matched && res.matchId) {
        toast('It’s a match!')
        await refresh()
        navigate(`/chat/${res.matchId}`)
        return
      }
      toast(kind === 'pass' ? 'Passed' : kind === 'super' ? 'Super like sent' : 'Liked')
      navigate(-1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="screen no-nav">
        <BackBar onBack={() => navigate(-1)} />
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="screen no-nav">
        <BackBar onBack={() => navigate(-1)} />
        <ErrorBar message={error ?? 'Profile not found'} />
        <button className="btn block" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    )
  }

  const p = data.profile
  const src = photoSrc(p, photo) ?? photoSrc(p, 0)

  return (
    <div className="screen no-nav" style={{ padding: 0, paddingBottom: 0 }}>
      <div style={{ position: 'relative', height: '56dvh', background: 'var(--surface-2)' }}>
        {src ? (
          <img
            src={src}
            alt={p.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setPhoto(0)}
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 64, color: 'var(--muted)' }}>
            {p.name.slice(0, 1)}
          </div>
        )}

        <div className="shade" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.9) 0%, transparent 45%)' }} />

        {p.photos.length > 1 ? (
          <div className="dots">
            {p.photos.map((_, i) => (
              <i key={i} className={i === photo ? 'on' : ''} />
            ))}
          </div>
        ) : null}

        <div className="topbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'transparent', borderBottom: 'none', margin: 0 }}>
          <button className="round" style={{ width: 38, height: 38, fontSize: 18 }} onClick={() => navigate(-1)} aria-label="Back">
            {Icons.back}
          </button>
          <div className="grow" />
          <button className="round" style={{ width: 38, height: 38 }} onClick={() => setMenu(true)} aria-label="Options">
            {Icons.dots}
          </button>
        </div>

        {p.photos.length > 1 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            <div style={{ flex: 1 }} onClick={() => setPhoto((i) => Math.max(0, i - 1))} />
            <div style={{ flex: 1 }} onClick={() => setPhoto((i) => Math.min(p.photos.length - 1, i + 1))} />
          </div>
        ) : null}

        <div className="info" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 18px 18px' }}>
          <div className="nm">
            {p.name} <span>{p.age}</span>
          </div>
          <div className="meta">
            {p.city}
            {data.distance_km != null ? ` · ${data.distance_km} km away` : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 32px' }}>
        <div className="chips" style={{ marginBottom: 14 }}>
          <span className="badge grad">{INTENT_LABEL[p.intent] ?? p.intent}</span>
          <span className="badge">{GENDER_LABEL[p.gender] ?? p.gender}</span>
          <span className="badge">Wants {p.seeking.map((s) => GENDER_LABEL[s] ?? s).join(' & ').toLowerCase() || '—'}</span>
        </div>

        <h3>About</h3>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 0, color: '#dcdce8' }}>{p.bio}</p>

        {p.interests.length ? (
          <>
            <h3 style={{ marginTop: 20 }}>Interests</h3>
            <div className="chips">
              {p.interests.map((i) => (
                <span className="chip" key={i} style={{ cursor: 'default' }}>
                  {i}
                </span>
              ))}
            </div>
          </>
        ) : null}

        <p className="tiny muted" style={{ marginTop: 22 }}>
          Joined {new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · Be
          respectful. Anything you send can be reported.
        </p>

        <div className="row" style={{ gap: 12, marginTop: 18 }}>
          <button className="round" style={{ flex: 1, borderRadius: 14 }} onClick={() => void act('pass')} aria-label="Pass">
            {Icons.x}
          </button>
          <button
            className="round"
            style={{ flex: 1, borderRadius: 14, color: 'var(--blue)' }}
            onClick={() => void act('super')}
            aria-label="Super like"
          >
            {Icons.star}
          </button>
          <button
            className="btn"
            style={{ flex: 2 }}
            onClick={() => void act('like')}
            disabled={acting}
          >
            Like {p.name}
          </button>
        </div>
      </div>

      {menu ? (
        <Sheet title={p.name} onClose={() => setMenu(false)}>
          <div className="stack">
            <button
              className="btn subtle block"
              onClick={() => {
                setMenu(false)
                setReporting(true)
              }}
            >
              Report this profile
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                setMenu(false)
                setConfirmBlock(true)
              }}
            >
              Block
            </button>
          </div>
        </Sheet>
      ) : null}

      {reporting ? (
        <Sheet title="Report" onClose={() => setReporting(false)}>
          <div className="field">
            <label>What’s wrong?</label>
            <div className="chips">
              {REPORT_REASONS.map(([value, label]) => (
                <button key={value} className="chip" aria-pressed={reason === value} onClick={() => setReason(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Details (optional)</label>
            <textarea className="textarea" value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <button
            className="btn block"
            onClick={() => {
              void api.report(p.user_id, reason, details).then(() => {
                setReporting(false)
                toast('Report sent. Thanks for keeping Spark safe.')
              })
            }}
          >
            Send report
          </button>
        </Sheet>
      ) : null}

      {confirmBlock ? (
        <Confirm
          title={`Block ${p.name}?`}
          body="They’ll disappear from your Discover, Likes and Chats, and can’t contact you again."
          confirmLabel="Block"
          danger
          onConfirm={() => {
            void api
              .block(p.user_id)
              .then(async () => {
                setConfirmBlock(false)
                await refresh()
                toast('Blocked')
                navigate('/chats')
              })
          }}
          onClose={() => setConfirmBlock(false)}
        />
      ) : null}
    </div>
  )
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="round" style={{ width: 38, height: 38, fontSize: 18 }} onClick={onBack} aria-label="Back">
        {Icons.back}
      </button>
      <h1>Profile</h1>
    </div>
  )
}
