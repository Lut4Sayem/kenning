import { useRef, useState } from 'react'
import s from './Overview.module.css'
import { useRenameTeam } from './useRenameTeam'

/** The team overview's h1. Admins click it to rename in place: Enter or leaving the field saves, Escape cancels (QA-63). */
export default function TeamTitle({ teamId, name, admin }: { teamId: string; name: string; admin: boolean }) {
  const rename = useRenameTeam(teamId)
  const [draft, setDraft] = useState<string | null>(null) // null = not editing
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelled = useRef(false) // Escape: the blur that follows must not save

  if (!admin) return <h1 className={s.name}>{name}</h1>
  if (draft === null) {
    return (
      <h1 className={s.name}>
        <button type="button" className={s.nameBtn} aria-label={`Rename team: ${name}`} title="Rename team" onClick={() => { cancelled.current = false; setError(''); setDraft(name) }}>
          {name}
        </button>
      </h1>
    )
  }

  async function save() {
    if (busy || draft === null || cancelled.current) return
    if (draft.trim() === name) return setDraft(null)
    setBusy(true)
    setError('')
    try {
      await rename(draft ?? '')
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename the team')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="sr-only">{name}</h1>
      <input
        className={`${s.name} ${s.nameInput}`} aria-label="Team name" value={draft} maxLength={60} autoFocus readOnly={busy}
        aria-invalid={error ? true : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void save() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setError(''); setDraft(null) }
        }}
      />
      {error && <p role="alert" className={s.nameError}>{error}</p>}
    </>
  )
}
