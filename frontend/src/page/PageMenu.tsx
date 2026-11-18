import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  archiveNode,
  lockNode,
  unarchiveNode,
  unlockNode,
  unpublishNode,
  updateNode,
  type NodeDetail,
} from '../api/nodes'
import MoveToTeamDialog from '../move/MoveToTeamDialog'
import Icon from '../ui/Icon'
import { toast } from '../ui/Toast'
import { dotColour, PAGE_COLOURS } from '../ui/pageColour'
import m from './PageMenu.module.css'
import { useTrashPage } from './useTrashPage'

interface Props {
  node: NodeDetail
  /** The open editor still has changes the server has not confirmed: do not take the page's edit rights away yet. */
  unsaved: boolean
  /** The page is in my private space: it can be moved into a team project. */
  personal?: boolean
  /** The tree row's copy (QA-18): its own name, look and Tab stop; opens at once when it was asked for before it loaded. */
  label?: string
  buttonClass?: string
  tabIndex?: number
  defaultOpen?: boolean
  className?: string
}

interface Item {
  label: string
  /** May return a notice to show after the action (e.g. where a restored page landed). */
  run: () => Promise<string | void>
  /** Why it cannot be used right now. */
  blocked?: string
}

/** Unarchives the page and refreshes it; returns a notice when it had to move to the top level. Also the archived banner's button. */
export function useUnarchive(node: Pick<NodeDetail, 'id' | 'spaceId'>) {
  const qc = useQueryClient()
  return async () => {
    const { movedToTop } = await unarchiveNode(node.id)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['node', node.id] }),
      qc.invalidateQueries({ queryKey: ['tree', node.spaceId] }),
    ])
    return movedToTop ? 'This page was moved to the top level of its space, because its parent was deleted or is in the trash.' : ''
  }
}

/** The "..." menu of a page (wireframe Main). Only for page editors, even when the page is locked or archived. */
export default function PageMenu({ node, unsaved, personal, label = 'Page actions', buttonClass = m.btn, tabIndex, defaultOpen = false, className }: Props) {
  const qc = useQueryClient()
  const trash = useTrashPage(node)
  const unarchive = useUnarchive(node)
  const [open, setOpen] = useState(defaultOpen)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [moving, setMoving] = useState<'team' | 'space' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const first = root.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')
    first?.focus()
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  if (!node.canManage) return null

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['node', node.id] }),
      qc.invalidateQueries({ queryKey: ['tree', node.spaceId] }),
    ])
  }
  const lockedNote = node.locked ? 'Unlock the page first' : undefined
  const savingNote = unsaved ? 'Wait until the page is saved' : undefined

  const items: Item[] = []
  if (node.status === 'ARCHIVED') {
    items.push({ label: 'Unarchive', run: unarchive })
  } else {
    if (node.publishState === 'PUBLISHED') {
      items.push({ label: 'Unpublish', blocked: lockedNote, run: async () => (await unpublishNode(node.id), await refresh()) })
    }
    items.push(
      node.locked
        ? { label: 'Unlock page', run: async () => (await unlockNode(node.id), await refresh()) }
        : { label: 'Lock page', blocked: savingNote, run: async () => (await lockNode(node.id), await refresh()) },
    )
    items.push({
      label: 'Archive',
      blocked: lockedNote ?? savingNote,
      run: async () => {
        await archiveNode(node.id)
        await refresh()
        toast(`Archived “${node.title || 'Untitled'}”. It’s read-only until someone unarchives it.`) // QA-35
      },
    })
    if (personal) {
      items.push({ label: 'Move to team', blocked: lockedNote ?? savingNote, run: async () => setMoving('team') })
    } else {
      items.push({ label: 'Move to…', blocked: lockedNote ?? savingNote, run: async () => setMoving('space') })
    }
    items.push({
      label: 'Move to trash',
      blocked: lockedNote ?? savingNote,
      run: trash,
    })
  }

  async function choose(item: Item) {
    setOpen(false)
    setError('')
    setNotice('')
    try {
      setNotice((await item.run()) || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    }
    button.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const all = [...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])]
      const i = all.indexOf(document.activeElement as HTMLElement)
      all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
    }
  }

  return (
    <div className={className ? `${m.root} ${className}` : m.root} ref={root} onKeyDown={onKeyDown}>
      <button ref={button} type="button" className={buttonClass} tabIndex={tabIndex} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className={m.list} role="menu" aria-label={label}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={!!item.blocked} title={item.blocked} onClick={() => void choose(item)}>
              {item.label}
              {item.blocked && <small>{item.blocked}</small>}
            </button>
          ))}
          {node.status === 'ACTIVE' && (
            <div className={m.colours}>
              <span aria-hidden="true" className={m.colourLabel}>Colour</span>
              <div role="group" aria-label="Page colour" className={m.swatches}>
                {PAGE_COLOURS.map((c) => {
                  const name = c[0].toUpperCase() + c.slice(1)
                  return (
                    <button key={c} type="button" role="menuitemradio" aria-checked={(node.color ?? 'gray') === c} aria-label={name}
                      title={lockedNote ?? name} disabled={!!lockedNote} className={m.swatch} style={{ background: dotColour(c) }}
                      onClick={() => void choose({ label: name, run: async () => (await updateNode(node.id, { color: c }), await refresh()) })} />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {moving && <MoveToTeamDialog node={node} mode={moving} onClose={() => { setMoving(null); button.current?.focus() }} />}
      {error && <p role="alert" className={m.error}>{error}</p>}
      {notice && <p role="status" className={m.note}>{notice}</p>}
    </div>
  )
}
