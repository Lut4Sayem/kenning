import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getVersion, listVersions, nameVersion, type VersionSummary } from '../api/versions'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { tintForUser } from './authorColours'
import { groupVersions } from './groupVersions'
import s from './History.module.css'

/** What the page shows in place of the editor while a version is selected. */
export interface Viewing {
  version: VersionSummary
  /** "Version 11": the version's place in this reader's list, oldest = 1 (null when not from the list). */
  number: number | null
  previousNumber: number | null
  /** The version's saved page state and the one it is compared with (base64 Yjs updates; '' = empty page). */
  state: string
  previousState: string
  canRestore: boolean
  /** 'previous': diff against the version before it; 'current': this version against the page as it is now. */
  against: 'previous' | 'current'
}

const SHOWN = 20 // DESIGN.md section 8: 20 versions, then "Load older versions"
const time = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
const names = (v: VersionSummary) => v.authors.map((a) => a.name).join(', ')

function kind(v: VersionSummary): string {
  switch (v.kind) {
    case 'NAMED': return v.name ?? 'Named version'
    case 'PUBLISHED': return 'Published'
    case 'RESTORED': return 'Restored from an older version'
    case 'RECOVERED': return 'Recovered unsaved changes'
    default: return 'Autosaved'
  }
}

export default function HistoryPanel({ nodeId, canEdit, viewing, onView, getCurrentState, restoring, restoreError, onRestore, onClose, now }: {
  nodeId: string
  canEdit: boolean
  viewing: Viewing | null
  onView: (v: Viewing | null) => void
  getCurrentState: () => string
  restoring: boolean
  restoreError: string
  onRestore: (versionId: string) => void
  onClose: () => void
  now?: Date
}) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['versions', nodeId], queryFn: () => listVersions(nodeId) })
  const [namedOnly, setNamedOnly] = useState(false)
  const [limit, setLimit] = useState(SHOWN)
  const [open, setOpen] = useState<Set<string>>(new Set()) // expanded session / private rows
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const all = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [list.data])
  const filtered = useMemo(() => (namedOnly ? all.filter((v) => v.kind === 'NAMED') : all), [all, namedOnly])
  const shown = filtered.slice(0, limit)
  const groups = useMemo(() => groupVersions(shown, now), [shown, now])
  const number = (v: VersionSummary) => all.length - all.findIndex((x) => x.id === v.id) // oldest = 1
  const authors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const v of all) for (const a of v.authors) seen.set(a.id, a.name)
    return [...seen]
  }, [all])
  const currentId = all[0]?.id

  async function select(v: VersionSummary) {
    setError('')
    try {
      const before = all[all.findIndex((x) => x.id === v.id) + 1] // the version before, even when the filter hides it
      const [cur, prev] = await Promise.all([getVersion(v.id), before ? getVersion(before.id) : Promise.resolve(null)])
      onView({ version: v, number: number(v), previousNumber: before ? number(before) : null, state: cur.state, previousState: prev?.state ?? '', canRestore: canEdit, against: 'previous' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this version')
    }
  }

  async function compareWithCurrent() {
    if (!viewing) return
    setError('')
    try {
      const old = await getVersion(viewing.version.id)
      onView({ ...viewing, state: getCurrentState(), previousState: old.state, against: 'current' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compare this version')
    }
  }

  async function saveName() {
    if (!name.trim()) return
    try {
      await nameVersion(nodeId, name.trim())
      setName('')
      setNaming(false)
      setError('')
      await qc.invalidateQueries({ queryKey: ['versions', nodeId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not name the version')
    }
  }

  const toggle = (key: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (!n.delete(key)) n.add(key)
      return n
    })

  const row = (v: VersionSummary) => (
    <button key={v.id} type="button" className={s.version} aria-current={v.id === viewing?.version.id} onClick={() => void select(v)}>
      <Avatar name={v.authors[0]?.name ?? '?'} size={26} />
      <span className={s.vtext}>
        <span className={s.vname}>{names(v) || 'Unknown'}</span>
        <span className={s.vkind}>{kind(v)}</span>
      </span>
      {v.id === currentId && <span className={s.current}>Current</span>}
      <time className={s.vtime} dateTime={v.createdAt}>{time(v.createdAt)}</time>
    </button>
  )

  const selectedIsCurrent = viewing?.version.id === currentId
  return (
    <div className={s.panel}>
      <div className={s.top}>
        <h2 className={s.title}>Version history</h2>
        <button type="button" className={s.close} aria-label="Close history" onClick={onClose}><Icon name="panel-right" /></button>
      </div>

      {authors.length > 0 && (
        <ul className={s.authors} aria-label="Authors">
          {authors.map(([id, n]) => (
            <li key={id}><span className={s.key} style={{ background: `var(--tint-${tintForUser(id)}-fg)` }} aria-hidden="true" />{n}</li>
          ))}
        </ul>
      )}

      <div className={s.tools}>
        <label className={s.check}>
          <input type="checkbox" checked={namedOnly} onChange={(e) => { setNamedOnly(e.target.checked); setLimit(SHOWN) }} />
          Named versions only
        </label>
        {canEdit && !naming && <button type="button" className={s.link} onClick={() => setNaming(true)}>Name the current version…</button>}
      </div>
      {canEdit && naming && (
        <form className={s.nameForm} onSubmit={(e) => { e.preventDefault(); void saveName() }}>
          <input className={s.field} aria-label="Version name" placeholder="Name the current version…" maxLength={100} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className={s.small}>Save</button>
        </form>
      )}
      {error && <p role="alert" className={s.error}>{error}</p>}

      <div className={s.listWrap}>
        {list.isPending && <div aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={s.skel} />)}</div>}
        {list.isError && <p role="alert" className={s.error}>Could not load the history. <button type="button" className={s.link} onClick={() => void list.refetch()}>Try again</button></p>}
        {list.data && !shown.length && <p className={s.empty}>{namedOnly ? 'No named versions yet. Name the current version to find it here later.' : 'No versions yet. They appear as people edit this page.'}</p>}
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h3 className={s.day}>{g.label}</h3>
            {g.items.map((it, i) => {
              if (it.kind === 'version') return row(it.version)
              const key = `${g.label}:${i}`
              const expanded = open.has(key)
              if (it.kind === 'session') {
                return (
                  <div key={key}>
                    {row(it.versions[0])}
                    <button type="button" className={s.more} aria-expanded={expanded} onClick={() => toggle(key)}>
                      {`${it.versions.length - 1} earlier ${it.versions.length - 1 === 1 ? 'checkpoint' : 'checkpoints'} in this session`}
                    </button>
                    {expanded && it.versions.slice(1).map(row)}
                  </div>
                )
              }
              const n = it.versions.length
              return (
                <div key={key}>
                  <button type="button" className={s.more} aria-expanded={expanded} onClick={() => toggle(key)}>
                    {`${n} private ${n === 1 ? 'draft' : 'drafts'} · Only you can see these`}
                  </button>
                  {expanded && it.versions.map(row)}
                </div>
              )
            })}
          </section>
        ))}
        {filtered.length > shown.length && <button type="button" className={s.link} onClick={() => setLimit((l) => l + SHOWN)}>Load older versions</button>}
      </div>

      {viewing && (
        <div className={s.footer}>
          {restoreError && <p role="alert" className={s.error}>{restoreError}</p>}
          {viewing.canRestore && !selectedIsCurrent && (
            <button type="button" className={s.restore} disabled={restoring} onClick={() => onRestore(viewing.version.id)}>
              <Icon name="history" />{restoring ? 'Restoring…' : 'Restore this version'}
            </button>
          )}
          {viewing.against === 'previous' && <button type="button" className={s.compare} onClick={() => void compareWithCurrent()}>Compare with current</button>}
        </div>
      )}
    </div>
  )
}
