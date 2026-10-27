import { useState } from 'react'
import { api, GENDER_LABEL, INTENT_LABEL, type City, type Profile } from '../api'
import PhotoGrid from '../PhotoGrid'
import { ErrorBar, Icons, toast } from '../ui'

const GENDERS = ['woman', 'man', 'nonbinary']
const INTENTS = ['casual', 'friends', 'longterm']

const INTEREST_POOL = [
  'Coffee', 'Hiking', 'Rooftop bars', 'Live music', 'Gym', 'Travel', 'Cooking', 'Dogs',
  'Cats', 'Art', 'Film nights', 'Brunch', 'Dancing', 'Books', 'Tattoos', 'Sushi',
  'Board games', 'Beach', 'Photography', 'Wine', 'Running', 'Gaming',
]

const STEPS = ['About you', 'What you want', 'Photos']

export default function Onboarding({
  existing,
  cities,
  onDone,
}: {
  existing: Profile | null
  cities: City[]
  onDone: (p: Profile) => void
}) {
  const hasBasics = Boolean(existing && existing.name && existing.bio && existing.seeking.length)
  const [step, setStep] = useState(hasBasics ? 2 : 0)
  const [saved, setSaved] = useState(Boolean(existing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(existing?.name ?? '')
  const [age, setAge] = useState(existing ? String(existing.age) : '')
  const [gender, setGender] = useState(existing?.gender ?? '')
  const [city, setCity] = useState(existing?.city ?? '')
  const [intent, setIntent] = useState(existing?.intent ?? 'casual')
  const [bio, setBio] = useState(existing?.bio ?? '')
  const [seeking, setSeeking] = useState<string[]>(existing?.seeking ?? [])
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? [])

  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const userId = existing?.user_id ?? ''

  const toggle = (list: string[], set: (v: string[]) => void, value: string, max: number) => {
    if (list.includes(value)) set(list.filter((v) => v !== value))
    else if (list.length < max) set([...list, value])
    else toast(`Up to ${max}`)
  }

  const basicsOk = name.trim().length >= 2 && Number(age) >= 18 && gender && city
  const aboutOk = bio.trim().length >= 10 && seeking.length > 0

  const saveBasics = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.saveProfile({
        name: name.trim(),
        age: Number(age),
        gender,
        city,
        intent,
        bio: bio.trim(),
        seeking,
        interests,
      })
      setSaved(true)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen no-nav" style={{ paddingTop: 26 }}>
      <div className="brand" style={{ marginBottom: 22 }}>
        <span className="dot" /> Spark
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ flex: 1 }}>
            <div
              style={{
                height: 4,
                borderRadius: 4,
                background: i <= step ? 'var(--accent)' : 'var(--surface-2)',
                marginBottom: 6,
              }}
            />
            <div className="tiny" style={{ color: i === step ? 'var(--text)' : 'var(--muted)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <ErrorBar message={error} />

      {step === 0 ? (
        <>
          <h2>Let’s start with you</h2>
          <p className="lead">This is what other people see first.</p>

          <div className="field">
            <label>Display name</label>
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
          </div>

          <div className="field">
            <label>Your age</label>
            <input
              className="input"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="18"
            />
            {age && Number(age) < 18 ? <p className="tiny" style={{ color: 'var(--danger)' }}>Spark is 18+ only.</p> : null}
          </div>

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
            <label>City</label>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Choose a city…</option>
              {cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button className="btn block" disabled={!basicsOk} onClick={() => setStep(1)}>
            Continue
          </button>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h2>What are you after?</h2>
          <p className="lead">Being upfront saves everyone time.</p>

          <div className="field">
            <label>I’m looking for</label>
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
                <button
                  key={g}
                  className="chip"
                  aria-pressed={seeking.includes(g)}
                  onClick={() => toggle(seeking, setSeeking, g, 3)}
                >
                  {GENDER_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>About me</label>
            <textarea
              className="textarea"
              value={bio}
              maxLength={600}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Say what you’re actually like. What you’re up for, what you’re not."
            />
            <p className="tiny muted">{bio.trim().length}/600 · minimum 10</p>
          </div>

          <div className="field">
            <label>Interests (up to 8)</label>
            <div className="chips">
              {INTEREST_POOL.map((i) => (
                <button
                  key={i}
                  className="chip"
                  aria-pressed={interests.includes(i)}
                  onClick={() => toggle(interests, setInterests, i, 8)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn grow" disabled={!aboutOk || busy} onClick={() => void saveBasics()}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h2>Add your photos</h2>
          <p className="lead">Profiles without photos don’t appear in Discover. Add at least one.</p>

          <PhotoGrid
            ownerId={userId}
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
          <div className="notice">
            {Icons.star} Photos are reviewed against our guidelines. No nudity, no violence, no other people
            without their consent.
          </div>

          <div className="row" style={{ gap: 10, marginTop: 18 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn grow"
              disabled={photos.length === 0 || !saved}
              onClick={() => {
                void api
                  .saveProfile({
                    name,
                    age: Number(age),
                    gender,
                    city,
                    intent,
                    bio,
                    seeking,
                    interests,
                  })
                  .then(({ profile }) => onDone(profile))
                  .catch((err) => setError(err instanceof Error ? err.message : 'Could not save'))
              }}
            >
              Start exploring
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
