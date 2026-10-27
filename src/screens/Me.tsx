import { useEffect, useState } from 'react'
import { api, GENDER_LABEL, INTENT_LABEL, photoSrc, type Profile } from '../api'
import { useSession } from '../App'
import PhotoGrid from '../PhotoGrid'
import { Avatar, Confirm, ErrorBar, Sheet, Spinner, toast } from '../ui'

const GENDERS = ['woman', 'man', 'nonbinary']
const INTENTS = ['casual', 'friends', 'longterm']

const INTEREST_POOL = [
  'Coffee', 'Hiking', 'Rooftop bars', 'Live music', 'Gym', 'Travel', 'Cooking', 'Dogs',
  'Cats', 'Art', 'Film nights', 'Brunch', 'Dancing', 'Books', 'Tattoos', 'Sushi',
  'Board games', 'Beach', 'Photography', 'Wine', 'Running', 'Gaming',
]

export default function Me() {
  const { profile, user, cities, setProfile, refresh } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showBlocks, setShowBlocks] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [name, setName] = useState(profile?.name ?? '')
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [gender, setGender] = useState(profile?.gender ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [intent, setIntent] = useState(profile?.intent ?? 'casual')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [seeking, setSeeking] = useState<string[]>(profile?.seeking ?? [])
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? [])
  const [visible, setVisible] = useState(profile?.visible ?? true)
  const [ageMin, setAgeMin] = useState(profile?.age_min ?? 18)
  const [ageMax, setAgeMax] = useState(profile?.age_max ?? 60)
  const [distance, setDistance] = useState(profile?.max_distance_km ?? 100)
  const [photos, setPhotos] = useState<string[]>(profile?.photos ?? [])

  if (!profile) return <div className="screen"><Spinner /></div>

  const toggle = (list: string[], set: (v: string[]) => void, value: string, max: number) => {
    if (list.includes(value)) set(list.filter((v) => v !== value))
    else if (list.length < max) set([...list, value])
    else toast(`Up to ${max}`)
  }

  const valid = name.trim().length >= 2 && Number(age) >= 18 && gender && city && bio.trim().length >= 10 && seeking.length > 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const { profile: next } = await api.saveProfile({
        name: name.trim(),
        age: Number(age),
        gender,
        city,
        intent,
        bio: bio.trim(),
        seeking,
        interests,
        visible,
        ageMin,
        ageMax,
        maxDistanceKm: distance,
      })
      setProfile(next)
      toast('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <h1>
          Me
          <div className="sub">Signed in as {user.email ?? user.name ?? 'you'}</div>
        </h1>
        <button className="btn sm" onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <ErrorBar message={error} />

      <PhotoGrid
        ownerId={profile.user_id}
        photos={photos}
        onUpload={async (file) => {
          const res = await api.uploadPhoto(file)
          setPhotos(res.photos)
        }}
        onDelete={async (i) => {
          const res = await api.deletePhoto(i)
          setPhotos(res.photos)
        }}
      />

      <div className="sep" />

      <div className="field">
        <label>Display name</label>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="field grow">
          <label>Age</label>
          <input
            className="input"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
        </div>
        <div className="field grow">
          <label>City</label>
          <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Choose…</option>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {age && Number(age) < 18 ? (
        <div className="error-bar">You must be 18 or older to use Spark.</div>
      ) : null}

      <div className="field">
        <label>Gender</label>
        <div className="chips">
          {GENDERS.map((g) => (
            <button key={g} className="chip" aria-pressed={gender === g} onClick={() => setGender(g)}>
              {GENDER_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Looking for</label>
        <div className="chips">
          {INTENTS.map((i) => (
            <button key={i} className="chip" aria-pressed={intent === i} onClick={() => setIntent(i)}>
              {INTENT_LABEL[i]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>I want to meet</label>
        <div className="chips">
          {GENDERS.map((g) => (
            <button key={g} className="chip" aria-pressed={seeking.includes(g)} onClick={() => toggle(seeking, setSeeking, g, 3)}>
              {GENDER_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>About me</label>
        <textarea className="textarea" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
        <p className="tiny muted">{bio.trim().length}/600</p>
      </div>

      <div className="field">
        <label>Interests (up to 8)</label>
        <div className="chips">
          {INTEREST_POOL.map((i) => (
            <button key={i} className="chip" aria-pressed={interests.includes(i)} onClick={() => toggle(interests, setInterests, i, 8)}>
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="sep" />
      <h3>Discovery</h3>

      <div className="field">
        <label>Show me · ages {ageMin} to {ageMax}</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            inputMode="numeric"
            value={ageMin}
            onChange={(e) => setAgeMin(Math.max(18, Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 18))}
          />
          <span className="muted">–</span>
          <input
            className="input"
            inputMode="numeric"
            value={ageMax}
            onChange={(e) => setAgeMax(Math.max(18, Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 18))}
          />
        </div>
      </div>

      <div className="field">
        <label>Maximum distance · {distance} km</label>
        <input type="range" min={5} max={500} step={5} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
      </div>

      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="grow">
          <div style={{ fontWeight: 650 }}>Visible in Discover</div>
          <div className="tiny muted">Turn off to hide your profile while keeping your matches.</div>
        </div>
        <button
          className="btn sm"
          style={{ background: visible ? 'var(--grad)' : 'var(--surface-2)' }}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? 'On' : 'Off'}
        </button>
      </div>

      <button className="btn block" style={{ marginTop: 16 }} onClick={() => void save()} disabled={!valid || busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>

      <div className="sep" />

      <div className="stack">
        <button className="btn subtle block" onClick={() => setShowBlocks(true)}>
          Blocked accounts
        </button>

        <form method="post" action="/auth/freebuff/signout?returnTo=/">
          <button className="btn ghost block" type="submit">
            Sign out
          </button>
        </form>

        <button className="btn danger block" onClick={() => setConfirmDelete(true)}>
          Delete my account
        </button>
      </div>

      <p className="tiny muted center" style={{ marginTop: 20 }}>
        Spark is for adults 18+. Be honest, be consensual, and report anything that feels off.
      </p>

      {showBlocks ? <BlocksSheet onClose={() => setShowBlocks(false)} /> : null}

      {confirmDelete ? (
        <Confirm
          title="Delete your account?"
          body="This removes your profile, photos, likes and matches. Your conversations stay visible to the other person, without your profile attached. This can’t be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={async () => {
            await api.deleteAccount()
            setConfirmDelete(false)
            window.location.href = '/'
          }}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  )
}

function BlocksSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    items: { user_id: string; profile: Profile | null }[]
  }>({ loading: true, error: null, items: [] })

  useEffect(() => {
    void api
      .blocks()
      .then((r) => setState({ loading: false, error: null, items: r.blocks }))
      .catch((e) => setState({ loading: false, error: e instanceof Error ? e.message : 'Could not load', items: [] }))
  }, [])

  return (
    <Sheet title="Blocked accounts" onClose={onClose}>
      {state.loading ? <Spinner /> : null}
      <ErrorBar message={state.error} />
      {!state.loading && !state.error && state.items.length === 0 ? (
        <p className="muted small">You haven’t blocked anyone.</p>
      ) : null}
      <div className="list">
        {state.items.map((b) => (
          <div className="item" key={b.user_id}>
            <Avatar
              name={b.profile?.name ?? '?'}
              src={b.profile ? photoSrc(b.profile) : null}
              size={44}
            />
            <div className="grow">
              <div className="nm">{b.profile?.name ?? 'Deleted account'}</div>
            </div>
            <button
              className="btn ghost sm"
              onClick={() => {
                void api.unblock(b.user_id).then(() =>
                  setState((s) => ({ ...s, items: s.items.filter((x) => x.user_id !== b.user_id) })),
                )
              }}
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
