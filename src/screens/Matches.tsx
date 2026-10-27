import { useNavigate } from 'react-router-dom'
import { api, photoSrc, type Profile } from '../api'
import { useSession } from '../App'
import { Avatar, Empty, ErrorBar, Spinner, timeAgo, useAsync } from '../ui'

export default function Matches() {
  const navigate = useNavigate()
  const { user, unread, setUnread } = useSession()
  const { data, error, loading } = useAsync(() => api.matches(), [])

  return (
    <div className="screen">
      <div className="topbar">
        <h1>
          Chats
          <div className="sub">Matches are for 24 hours of good conversation — say something</div>
        </h1>
      </div>

      <ErrorBar message={error} />
      {loading ? <Spinner /> : null}

      {data && data.matches.length === 0 && !loading ? (
        <Empty icon="💬" title="No matches yet" hint="Like someone in Discover and you’ll be able to talk here." />
      ) : null}

      <div className="list">
        {data?.matches.map((m) => {
          const p: Profile | null = m.profile
          if (!p) return null
          const preview = m.last_message
            ? `${m.last_message.sender_id === user.sub ? 'You: ' : ''}${m.last_message.body}`
            : `${p.name} matched with you`
          return (
            <div
              key={m.id}
              className="item"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (m.unread) setUnread(Math.max(0, unread - m.unread))
                navigate(`/chat/${m.id}`)
              }}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/chat/${m.id}`)}
            >
              <Avatar name={p.name} src={photoSrc(p)} />
              <div className="grow">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="nm">
                    {p.name}, {p.age}
                  </span>
                  <span className="tm">{m.last_message ? timeAgo(m.last_message.created_at) : timeAgo(m.created_at)}</span>
                </div>
                <div className="pv" style={{ color: m.unread ? 'var(--text)' : undefined, fontWeight: m.unread ? 650 : 400 }}>
                  {preview}
                </div>
              </div>
              {m.unread ? <span className="unread">{m.unread}</span> : null}
            </div>
          )
        })}
      </div>

      {data && data.matches.length > 0 ? (
        <p className="tiny muted center" style={{ marginTop: 16 }}>
          Tap a chat to open it. Unmatch or block from inside the conversation.
        </p>
      ) : null}

      <a href="/likes" className="btn ghost block" style={{ marginTop: 18 }}>
        See who liked you
      </a>
    </div>
  )
}
