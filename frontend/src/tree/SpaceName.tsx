import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getTree } from '../api/nodes'
import { deleteSpace, renameSpace, type MySpace } from '../api/spaces'
import { confirmDialog } from '../ui/ConfirmDialog'
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

/**
 * "Delete space" (team admins). Spaces have no trash, so the server deletes only an empty one; the dialog says how many
 * pages it holds and, when there are any, sends you to the space to move them out instead.
 */
export function useDeleteSpace(space: MySpace) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const here = useLocation().pathname
  return async () => {
    let count: number
    try {
      count = (await qc.fetchQuery({ queryKey: ['tree', space.id], queryFn: () => getTree(space.id) })).length
    } catch {
      return toast('Could not check the space’s pages. Try again.', 'error')
    }
    if (count > 0) {
      const open = await confirmDialog({
        title: `“${space.name}” still holds ${count} ${count === 1 ? 'page' : 'pages'}`,
        body: 'A space can be deleted only when it is empty. Move its pages to another space or to the trash first.',
        confirmLabel: 'Open the space', cancelLabel: 'Close',
      })
      if (open) navigate(`/s/${space.id}`)
      return
    }
    const yes = await confirmDialog({
      title: `Delete “${space.name}”?`,
      body: 'It holds no pages. Pages in its trash are deleted forever with it. This can’t be undone.',
      confirmLabel: 'Delete space', danger: true,
    })
    if (!yes) return
    try {
      await deleteSpace(space.id)
    } catch (e) {
      return toast(e instanceof Error ? e.message : 'Could not delete the space.', 'error')
    }
    if (here.startsWith(`/s/${space.id}`)) navigate(space.teamId ? `/teams/${space.teamId}` : '/')
    await Promise.all(['spaces', 'team-spaces', 'team-summary'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    qc.removeQueries({ queryKey: ['tree', space.id] })
    toast(`Deleted “${space.name}”`)
  }
}
