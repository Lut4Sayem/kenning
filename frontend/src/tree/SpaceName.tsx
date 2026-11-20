import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { renameSpace } from '../api/spaces'
import { toast } from '../ui/Toast'

/** Renames a team space and refreshes everything that shows its name. Rejects with the server's message. */
export function useRenameSpace(spaceId: string) {
  const qc = useQueryClient()
  return async (name: string) => {
    const space = await renameSpace(spaceId, name.trim())
    await Promise.all(['spaces', 'team-spaces', 'team-summary', 'node'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    toast(`Renamed to ${space.name}`)
  }
}

/** Inline rename field: Enter or leaving the field saves, Escape cancels; an error keeps the field open. */
export default function SpaceNameInput({ spaceId, name, className, errorClass, onDone }: {
  spaceId: string; name: string; className?: string; errorClass?: string; onDone: () => void
}) {
  const rename = useRenameSpace(spaceId)
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelled = useRef(false) // Escape: the blur that follows must not save

  async function save() {
    if (busy || cancelled.current) return
    if (draft.trim() === name) return onDone()
    setBusy(true)
    setError('')
    try {
      await rename(draft)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename the space')
      setBusy(false)
    }
  }

  return (
    <>
      <input
        className={className} aria-label="Space name" value={draft} maxLength={200} autoFocus readOnly={busy}
        onFocus={(e) => e.currentTarget.select()} aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void save() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; onDone() }
        }}
      />
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </>
  )
}
