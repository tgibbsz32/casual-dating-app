import { useRef, useState } from 'react'
import { photoUrl } from './api'
import { ErrorBar } from './ui'

export default function PhotoGrid({
  ownerId,
  photos,
  onUpload,
  onDelete,
  max = 3,
}: {
  ownerId: string
  photos: string[]
  onUpload: (file: File) => Promise<void>
  onDelete: (index: number) => Promise<void>
  max?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (index: number) => {
    setBusy(true)
    setError(null)
    try {
      await onDelete(index)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove photo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ErrorBar message={error} />
      <div className="grid-photos">
        {photos.map((key, i) => (
          <div className="ph" key={key}>
            <img src={photoUrl(ownerId, key)} alt={`Photo ${i + 1}`} />
            <button className="del" onClick={() => void remove(i)} aria-label="Remove photo" disabled={busy}>
              ×
            </button>
          </div>
        ))}
        {photos.length < max ? (
          <button className="add" onClick={() => input.current?.click()} disabled={busy} aria-label="Add photo">
            {busy ? '…' : '+'}
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e)} />
      <p className="tiny muted" style={{ marginTop: 10 }}>
        JPEG, PNG or WebP, up to 6 MB. Your first photo becomes your main one.
      </p>
    </div>
  )
}
