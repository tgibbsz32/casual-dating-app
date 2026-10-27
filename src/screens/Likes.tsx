import { Link } from 'react-router-dom'
import { api, photoSrc } from '../api'
import { Empty, ErrorBar, Spinner, useAsync } from '../ui'

export default function Likes() {
  const { data, error, loading } = useAsync(() => api.likes(), [])

  return (
    <div className="screen">
      <div className="topbar">
        <h1>
          Likes you
          <div className="sub">People who already liked you — match to start talking</div>
        </h1>
      </div>

      <ErrorBar message={error} />
      {loading ? <Spinner /> : null}

      {data && data.profiles.length === 0 && !loading ? (
        <Empty icon="👀" title="No likes yet" hint="Keep your profile fresh and check back — likes show up here first." />
      ) : null}

      <div className="grid-photos">
        {data?.profiles.map((p) => (
          <Link key={p.user_id} to={`/p/${p.user_id}`} className="ph" style={{ display: 'block' }}>
            {photoSrc(p) ? (
              <img src={photoSrc(p)!} alt={p.name} />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 34, color: 'var(--muted)' }}>
                {p.name.slice(0, 1)}
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,.75), transparent 55%)',
              }}
            />
            <div style={{ position: 'absolute', left: 8, bottom: 7, right: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {p.name}, {p.age}
              </div>
              <div className="tiny" style={{ color: '#cfcfe0' }}>
                {p.distance_km != null ? `${p.distance_km} km` : p.city}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {data && data.profiles.length > 0 ? (
        <p className="tiny muted center" style={{ marginTop: 16 }}>
          Open a profile to like them back or pass.
        </p>
      ) : null}
    </div>
  )
}
