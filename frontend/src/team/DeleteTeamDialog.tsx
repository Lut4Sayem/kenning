import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { deleteTeam, getTeamSummary } from '../api/teams'
import { plural } from './TeamOverview'
import { useTeamGone } from './useTeamGone'
import s from '../ui/FormDialog.module.css'

/** QA-67: "Delete team" for admins (team Overview danger zone and the sidebar team menu). Needs the exact name. */
export default function DeleteTeamDialog({ teamId, name, onClose }: { teamId: string; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const summary = useQuery({ queryKey: ['team-summary', teamId], queryFn: () => getTeamSummary(teamId) })
  const gone = useTeamGone()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = typed === name

  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement as HTMLElement | null
    if (typeof dialog.showModal === 'function') dialog.showModal() // jsdom has none
    else dialog.setAttribute('open', '')
    return () => {
      if (typeof dialog.close === 'function') dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!matches || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteTeam(teamId, typed)
      onClose()
      await gone(teamId, `Deleted ${name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  const d = summary.data
  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby={`${id}-t`} aria-describedby={`${id}-w`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}>
      <form onSubmit={submit}>
        <h2 id={`${id}-t`} className={s.title}>Delete {name}?</h2>
        <p id={`${id}-w`} className={s.warning}>A deleted team can’t be restored. Its spaces, pages, files and comments are gone for good.</p>
        <p className={s.body}>
          {d ? `What will be deleted: ${plural(d.spaceCount, 'space')}, ${plural(d.pageCount, 'page')}, ${plural(d.memberCount, 'member')}.` : 'Counting what will be deleted…'}
        </p>
        <label htmlFor={`${id}-f`} className={`${s.label} ${s.noteLabel}`}>Type <strong>{name}</strong> to confirm</label>
        <input id={`${id}-f`} className={s.input} value={typed} autoComplete="off" spellCheck={false} autoFocus
          onChange={(e) => setTyped(e.target.value)} aria-describedby={error ? `${id}-e` : undefined} aria-invalid={error ? true : undefined} />
        {error && <p id={`${id}-e`} className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={s.danger} disabled={!matches || busy}>Delete team</button>
        </div>
      </form>
    </dialog>
  )
}
