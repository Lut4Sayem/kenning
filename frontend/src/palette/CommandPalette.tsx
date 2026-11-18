import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { createNode, type NodeSummary } from '../api/nodes'
import { getRecent, searchAll, type SearchHit } from '../api/search'
import { canEditSpace, getMySpaces } from '../api/spaces'
import Icon, { type IconName } from '../ui/Icon'
import s from './CommandPalette.module.css'
import { toast } from '../ui/Toast'
import { dotColour } from '../ui/pageColour'
import Snippet from './Snippet'

const DEBOUNCE_MS = 200
const GROUP_MAX = 5 // DESIGN.md section 8: refine the search instead of scrolling
const SCOPES = [
  { id: 'all', label: 'All' },
  { id: 'pages', label: 'Pages', icon: 'file' },
  { id: 'content', label: 'Content', icon: 'text-lines' },
  { id: 'actions', label: 'Actions', icon: 'zap' },
] as const
type Scope = (typeof SCOPES)[number]['id']

interface Props {
  open: boolean
  onClose: () => void
}

/** Where a page lives, as one chip: "Team / Space", or "Private" for my own space. */
export const placeOf = (teamName: string | null | undefined, spaceName: string | null | undefined) =>
  teamName == null ? 'Private' : [teamName, spaceName].filter(Boolean).join(' / ')

/** The first place the typed term appears in a title, in a mark (title matches are case-insensitive, anywhere: D-04). */
export function markMatch(title: string, term: string): ReactNode {
  const i = term ? title.toLowerCase().indexOf(term.toLowerCase()) : -1
  if (i < 0) return title
  return <>{title.slice(0, i)}<mark>{title.slice(i, i + term.length)}</mark>{title.slice(i + term.length)}</>
}

/** Ctrl+K palette (task 7.2). Mounted by the Shell; the Shell also owns the shortcut and the focus return. */
export default function CommandPalette({ open, onClose }: Props) {
  return open ? <Palette onClose={onClose} /> : null // unmounted when closed: every open starts empty and fresh
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const activeId = useMatch('/p/:nodeId')?.params.nodeId
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [content, setContent] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const term = q.trim()

  const recent = useQuery({ queryKey: ['recent'], queryFn: getRecent, staleTime: 0, gcTime: 0, retry: false })
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })

  // Layout effect: the dialog is open and the input focused before the browser can deliver the next key.
  useLayoutEffect(() => {
    const d = dialog.current
    if (d && typeof d.showModal === 'function') d.showModal()
    else d?.setAttribute('open', '') // jsdom has no showModal
    input.current?.focus()
    return () => {
      if (d && typeof d.close === 'function' && d.open) d.close()
    }
  }, [])

  // Server search for page content, after a pause. An answer that is no longer the latest question is dropped.
  useEffect(() => {
    const id = ++seq.current
    setContent([]) // hits of the previous term must not stay selectable while the new answer is on its way
    setSearching(!!term)
    if (!term) return
    const t = setTimeout(() => {
      const done = (r: SearchHit[]) => {
        if (id !== seq.current) return
        setContent(r.filter((h) => h.type === 'PAGE'))
        setSearching(false)
      }
      searchAll({ q: term, limit: 10 }).then(done, () => done([]))
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [term])

  // Title match over the trees the sidebar has already loaded: instant, no request.
  const all = spaces.data ?? []
  const trees = qc.getQueriesData<NodeSummary[]>({ queryKey: ['tree'] })
  const lower = term.toLowerCase()
  const local = !term ? [] : trees.flatMap(([key, nodes]) =>
    (nodes ?? []).filter((n) => n.title.toLowerCase().includes(lower)).map((n) => ({ ...n, spaceId: String(key[1]) })),
  )
  const localIds = new Set(local.map((n) => n.id))
  // Server hits whose title holds the term are page (title) matches too: the sidebar has not loaded every tree.
  const titled = content.filter((h) => h.nodeId && !localIds.has(h.nodeId) && h.title.toLowerCase().includes(lower))
  const pageIds = new Set([...localIds, ...titled.map((h) => h.nodeId)])
  const pages = term
    ? [
      ...local.map((n) => {
        const sp = all.find((x) => x.id === n.spaceId)
        return { id: n.id, title: n.title, color: n.color, place: sp ? placeOf(sp.teamName, sp.name) : '' }
      }),
      ...titled.map((h) => ({ id: h.nodeId!, title: h.title, color: h.color, place: placeOf(h.teamName, h.spaceName) })),
    ]
    : (recent.data ?? []).map((h) => ({ id: h.nodeId!, title: h.title, color: h.color, place: placeOf(h.teamName, h.spaceName) }))
  const inContent = content.filter((h) => h.nodeId && !pageIds.has(h.nodeId))

  // "Current project" = the space whose tree holds the open page, else the private space, else the first one.
  const currentId = trees.find(([, nodes]) => nodes?.some((n) => n.id === activeId))?.[0][1]
  const current = all.find((x) => x.id === currentId) ?? all.find((x) => x.ownerType === 'USER') ?? all[0]
  // A viewer can't add pages to the current space (QA-37): offer the private space instead.
  const target = current && canEditSpace(current) ? current : all.find((x) => x.ownerType === 'USER')
  const actions: { id: string; label: string; icon: IconName; run: () => unknown }[] = [
    ...(!target ? [] : [
      { id: 'new-page', label: `New page in ${target.name}`, icon: 'plus' as const, run: async () => {
        const page = await createNode(target.id, {})
        await qc.invalidateQueries({ queryKey: ['tree', target.id] })
        nav(`/p/${page.id}`)
      } },
    ]),
    ...(!current ? [] : [
      { id: 'open-trash', label: 'Open trash', icon: 'trash' as const, run: () => nav(`/s/${current.id}/trash`) },
    ]),
  ].filter((a) => !term || a.label.toLowerCase().includes(lower))
  if (term) actions.push({ id: 'see-all', label: `See all results for “${term}”`, icon: 'search', run: () => nav(`/search?q=${encodeURIComponent(term)}`) })

  const counts: Record<Scope, number> = { all: 0, pages: pages.length, content: inContent.length, actions: actions.length }
  counts.all = counts.pages + counts.content + counts.actions
  const shows = (x: Scope) => scope === 'all' || scope === x
  const cap = <T,>(list: T[], x: Scope) => (scope === x ? list : list.slice(0, GROUP_MAX))

  function open(nodeId: string) {
    onClose()
    nav(`/p/${nodeId}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault() // the browser's own Esc would close the dialog before focus is handed back
      onClose()
    } else if (e.key === 'Tab') {
      // Tab switches the filter; focus stays in the search box (the only control a keyboard user needs here).
      e.preventDefault()
      const i = SCOPES.findIndex((x) => x.id === scope)
      setScope(SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length].id)
      input.current?.focus()
    }
  }

  const head = (icon: IconName, tint: string, name: string, n: number) => (
    <span className={s.head}><span className={`${s.headTile} ${tint}`}><Icon name={icon} size={14} /></span>{name}<span className={s.count}>{n}</span></span>
  )
  const go = <span className={s.go} aria-hidden="true">Open<Icon name="enter" size={14} /></span>
  const nothing = term && !searching && counts[scope] === 0

  return (
    <dialog ref={dialog} className={s.dialog} aria-label="Search pages and actions" onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === dialog.current) onClose() }} onCancel={(e) => e.preventDefault()}>
      <Command shouldFilter={false} label="Search pages and actions" className={s.cmd}>
        <div className={s.inputRow}>
          <Icon name="search" size={18} />
          <Command.Input ref={input} value={q} onValueChange={setQ} placeholder="Search pages and actions" maxLength={200} autoFocus className={s.input} />
          <kbd className={s.kbd} aria-hidden="true">Esc</kbd>
        </div>
        <div className={s.scopes} role="group" aria-label="Search in">
          {SCOPES.map((x) => (
            <button key={x.id} type="button" tabIndex={-1} className={s.scope} aria-pressed={scope === x.id}
              onMouseDown={(e) => e.preventDefault()} onClick={() => setScope(x.id)}>
              {'icon' in x && <Icon name={x.icon} size={14} />}{x.label}<span className={s.scopeN}>{counts[x.id]}</span>
            </button>
          ))}
        </div>
        <Command.List className={s.list}>
          {term && searching && <p className={s.note} aria-live="polite">Searching…</p>}
          {nothing && <Command.Empty className={s.note}>Nothing matches “{term}”. Try a shorter word{scope !== 'all' ? ' or another filter' : ''}.</Command.Empty>}
          {shows('pages') && pages.length > 0 && (
            <Command.Group heading={head('file', s.tMint, term ? 'Pages' : 'Recent', pages.length)} className={s.group}>
              {cap(pages, 'pages').map((p) => (
                <Command.Item key={p.id} value={`page-${p.id}`} onSelect={() => open(p.id)} className={s.item}>
                  <span className={s.dot} style={{ background: dotColour(p.color) }} aria-hidden="true" />
                  <span className={s.title} title={p.title || 'Untitled'}>{markMatch(p.title || 'Untitled', term)}</span>
                  {p.place && <span className={s.chip}>{p.place}</span>}
                  {go}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {shows('content') && inContent.length > 0 && (
            <Command.Group heading={head('text-lines', s.tSky, 'Found inside pages', inContent.length)} className={s.group}>
              {cap(inContent, 'content').map((h) => (
                <Command.Item key={h.nodeId} value={`content-${h.nodeId}`} onSelect={() => open(h.nodeId!)} className={s.item}>
                  <span className={s.dot} style={{ background: dotColour(h.color) }} aria-hidden="true" />
                  <span className={s.two}>
                    <span className={s.snip}>{h.snippetHtml ? <Snippet html={h.snippetHtml} /> : h.title || 'Untitled'}</span>
                    <span className={s.from}>in {h.title || 'Untitled'}</span>
                  </span>
                  {go}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {shows('actions') && actions.length > 0 && (
            <Command.Group heading={head('zap', s.tGray, 'Actions', actions.length)} className={s.group}>
              {actions.map((a) => (
                <Command.Item key={a.id} value={`action-${a.id}`} className={s.item} onSelect={() => {
                  onClose()
                  Promise.resolve(a.run()).catch(() => toast('That did not work. Check your connection and try again.', 'error'))
                }}>
                  <span className={s.actTile} aria-hidden="true"><Icon name={a.icon} size={14} /></span>
                  <span className={s.title}>{a.label}</span>
                  {go}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className={s.foot}>
          <span><kbd className={s.kbd}>↑</kbd><kbd className={s.kbd}>↓</kbd>Move</span>
          <span><kbd className={s.kbd}>Tab</kbd>Switch filter</span>
          <span><kbd className={s.kbd}>Enter</kbd>Open</span>
          <span><kbd className={s.kbd}>Esc</kbd>Close</span>
        </div>
      </Command>
    </dialog>
  )
}
