import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { updateNode, type NodeDetail } from '../api/nodes'
import Icon from '../ui/Icon'
import { tintOf } from '../ui/tint'
import s from './Page.module.css'

/** Tag chips (tint by name) that link to the tag's page list. Editors add with "+ Add" and remove with ×. */
export default function TagEditor({ node, canEdit }: { node: NodeDetail; canEdit: boolean }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  // QA-66: each save is built from the latest local list and sent after the one before it, so quick adds don't overwrite each other.
  const latest = useRef(node.tags)
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  if (pending.current === 0) latest.current = node.tags

  function save(change: (tags: string[]) => string[]) {
    const tags = change(latest.current)
    latest.current = tags
    pending.current++
    queue.current = queue.current.then(async () => {
      try {
        const saved = await updateNode(node.id, { tags })
        qc.setQueryData(['node', node.id], saved)
        setError('')
      } catch (e) {
        latest.current = node.tags
        setError(e instanceof Error ? e.message : 'Could not save the tags.')
      } finally {
        pending.current--
      }
    })
  }

  // QA-24: Enter/comma keeps the field open for the next tag; leaving it closes it.
  function add(close: boolean) {
    const tag = draft.trim().replace(/^#/, '')
    setDraft('')
    if (close) setAdding(false)
    if (tag) save((tags) => (tags.includes(tag) ? tags : [...tags, tag]))
  }

  if (!canEdit && node.tags.length === 0) return <span className={s.hint}>No tags</span>
  return (
    <>
      <ul className={s.tags} aria-label="Tags">
        {node.tags.map((t) => {
          const tint = tintOf(t)
          return (
            <li key={t} className={s.chip} style={{ background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)` }}>
              <Link to={`/tags/${encodeURIComponent(t)}`}>{t}</Link>
              {canEdit && <button type="button" aria-label={`Remove tag ${t}`} onClick={() => save((tags) => tags.filter((x) => x !== t))}><Icon name="close" size={12} /></button>}
            </li>
          )
        })}
        {canEdit && (adding ? (
          <li>
            <input
              className={s.tagInput}
              aria-label="Add tag"
              placeholder="Tag name"
              maxLength={40}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.toLowerCase())} // tags are stored in lowercase: show it while typing
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(false) }
                else if (e.key === 'Escape') { setDraft(''); setAdding(false) }
              }}
              onBlur={() => add(true)}
            />
          </li>
        ) : (
          <li><button type="button" className={s.add} onClick={() => setAdding(true)}><Icon name="plus" size={12} />Add</button></li>
        ))}
      </ul>
      {error && <p role="alert" className={s.error}>{error}</p>}
    </>
  )
}
