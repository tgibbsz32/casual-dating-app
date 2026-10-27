import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

/* ── toast ─────────────────────────────────────────────────────────── */
let message: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

export function toast(text: string) {
  message = text
  listeners.forEach((l) => l())
  clearTimeout(timer)
  timer = setTimeout(() => {
    message = null
    listeners.forEach((l) => l())
  }, 2600)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function ToastHost() {
  const text = useSyncExternalStore(subscribe, () => message)
  return text ? <div className="toast">{text}</div> : null
}

/* ── async helper ──────────────────────────────────────────────────── */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fn())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Something went wrong'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void run()
  }, [run])

  return { data, error, loading, reload: run }
}

/* ── primitives ────────────────────────────────────────────────────── */
export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />
}

export function ErrorBar({ message }: { message: string | Error | null | undefined }) {
  if (!message) return null
  const text = message instanceof Error ? message.message : message
  if (!text) return null
  return <div className="error-bar" role="alert">{text}</div>
}

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ color: 'var(--text)', fontWeight: 650, marginBottom: 4 }}>{title}</div>
      {hint ? <div className="small">{hint}</div> : null}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>{body}</p>
      <div className="stack" style={{ marginTop: 16 }}>
        <button className={`btn block ${danger ? 'danger' : ''}`} onClick={() => void onConfirm()}>
          {confirmLabel}
        </button>
        <button className="btn ghost block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  )
}

/** A person's photo with an initials fallback when they have none. */
export function Avatar({ name, src, size = 54 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.36 }
  if (src) return <img className="av" style={style} src={src} alt={name} loading="lazy" />
  return (
    <div className="av" style={style} aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/* ── icons ─────────────────────────────────────────────────────────── */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Icons = {
  flame: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.7.7-3 1.5-4 .2 1 .9 1.8 1.8 1.8 1.2 0 1.9-1 1.7-2.6C11.7 5.6 12 3 12 3Z" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.4-4A7.5 7.5 0 1 1 20 12Z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="24" height="24" {...stroke}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="24" height="24" {...stroke}>
      <path d="m12 4 2.3 4.9 5.2.7-3.8 3.7.9 5.3L12 16.1 7.4 18.6l.9-5.3L4.5 9.6l5.2-.7L12 4Z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  ),
}
