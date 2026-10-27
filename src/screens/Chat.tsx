import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, photoSrc, type Message, type Profile } from '../api'
import { useSession } from '../App'
import { Avatar, Confirm, ErrorBar, Icons, Sheet, Spinner, clockTime, toast } from '../ui'

export default function Chat() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user, profile, setUnread, refresh } = useSession()

  const [partner, setPartner] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<null | 'unmatch' | 'block'>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('fake')
  const [details, setDetails] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const [list, thread] = await Promise.all([api.matches(), api.messages(id)])
      setPartner(list.matches.find((m) => m.id === id)?.profile ?? null)
      setMessages(thread.messages)
      setError(null)
      await api.markRead(id)
      setUnread(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load conversation')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
    const timer = setInterval(() => void load(), 6000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText('')
    try {
      const { message } = await api.sendMessage(id, body)
      setMessages((m) => [...m, message])
    } catch (err) {
      setText(body)
      toast(err instanceof Error ? err.message : 'Could not send')
    }
  }

  const doUnmatch = async () => {
    await api.unmatch(id)
    setConfirm(null)
    toast('Unmatched')
    await refresh()
    navigate('/chats')
  }

  const doBlock = async () => {
    if (partner) await api.block(partner.user_id)
    setConfirm(null)
    toast('Blocked')
    await refresh()
    navigate('/chats')
  }

  const doReport = async () => {
    if (!partner) return
    await api.report(partner.user_id, reason, details)
    setReporting(false)
    toast('Report sent. Thanks for keeping Spark safe.')
  }

  if (loading && !partner) {
    return (
      <div className="screen no-nav">
        <TopBar title="Chat" onBack={() => navigate('/chats')} />
        <Spinner />
      </div>
    )
  }

  return (
    <div className="chat">
      <div className="topbar" style={{ margin: 0 }}>
        <button className="round" style={{ width: 38, height: 38, fontSize: 18 }} onClick={() => navigate('/chats')} aria-label="Back">
          {Icons.back}
        </button>
        {partner ? (
          <div
            className="row grow"
            style={{ cursor: 'pointer' }}
            onClick={() => partner && navigate(`/p/${partner.user_id}`)}
          >
            <Avatar name={partner.name} src={photoSrc(partner)} size={38} />
            <div>
              <div style={{ fontWeight: 650, fontSize: 15 }}>
                {partner.name}, {partner.age}
              </div>
              <div className="tiny muted">{partner.city}</div>
            </div>
          </div>
        ) : (
          <h1>Chat</h1>
        )}
        <button className="round" style={{ width: 38, height: 38, fontSize: 18 }} onClick={() => setMenu(true)} aria-label="Conversation options">
          {Icons.dots}
        </button>
      </div>

      <ErrorBar message={error} />

      <div className="stream">
        {partner ? (
          <p className="tiny muted center" style={{ margin: '4px 0 12px' }}>
            You matched with {partner.name}. Be direct, be respectful, and keep it consensual.
          </p>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.sender_id === user.sub
          const showTime = i === messages.length - 1 || messages[i + 1]?.sender_id !== m.sender_id
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              <div className={`bub ${mine ? 'me' : 'them'}`}>{m.body}</div>
              {showTime ? <div className="tiny time">{clockTime(m.created_at)}</div> : null}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={partner ? `Message ${partner.name}…` : 'Message…'}
          maxLength={1000}
        />
        <button type="submit" aria-label="Send" disabled={!text.trim()}>
          ↑
        </button>
      </form>

      {menu ? (
        <Sheet title={partner ? partner.name : 'Conversation'} onClose={() => setMenu(false)}>
          <div className="stack">
            {partner ? (
              <button className="btn subtle block" onClick={() => { setMenu(false); navigate(`/p/${partner.user_id}`) }}>
                View profile
              </button>
            ) : null}
            <button className="btn subtle block" onClick={() => { setMenu(false); setReporting(true) }}>
              Report this person
            </button>
            <button className="btn danger block" onClick={() => { setMenu(false); setConfirm('unmatch') }}>
              Unmatch
            </button>
            <button className="btn danger block" onClick={() => { setMenu(false); setConfirm('block') }}>
              Block &amp; report
            </button>
          </div>
        </Sheet>
      ) : null}

      {reporting && partner ? (
        <Sheet title="Report" onClose={() => setReporting(false)}>
          <div className="field">
            <label>What’s wrong?</label>
            <div className="chips">
              {[
                ['fake', 'Fake profile'],
                ['harassment', 'Harassment'],
                ['nudity', 'Nudity'],
                ['spam', 'Spam'],
                ['underage', 'Under 18'],
                ['other', 'Something else'],
              ].map(([value, label]) => (
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
          <button className="btn block" onClick={() => void doReport()}>
            Send report
          </button>
        </Sheet>
      ) : null}

      {confirm === 'unmatch' ? (
        <Confirm
          title={`Unmatch ${partner?.name ?? ''}?`}
          body="You’ll both stop seeing each other and the conversation closes. You can’t undo this."
          confirmLabel="Unmatch"
          danger
          onConfirm={() => void doUnmatch()}
          onClose={() => setConfirm(null)}
        />
      ) : null}

      {confirm === 'block' ? (
        <Confirm
          title={`Block ${partner?.name ?? ''}?`}
          body="They’ll disappear from your Discover, Likes and Chats, and can’t contact you again. We’ll also send your report to moderation."
          confirmLabel="Block"
          danger
          onConfirm={() => void doBlock()}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  )
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="round" style={{ width: 38, height: 38, fontSize: 18 }} onClick={onBack} aria-label="Back">
        {Icons.back}
      </button>
      <h1>{title}</h1>
    </div>
  )
}
