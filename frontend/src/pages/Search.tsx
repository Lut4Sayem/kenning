import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchAll, type SearchHit } from '../api/search'
import { TopBar } from '../app/ShellSlots'
import { placeOf } from '../palette/CommandPalette'
import Snippet from '../palette/Snippet'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { markWords } from '../ui/markWords'
import Segmented from '../ui/Segmented'
import TeamTile from '../ui/TeamTile'
import { timeAgo } from '../ui/timeAgo'
import s from './Search.module.css'

const DEBOUNCE_MS = 300
const GROUP_MAX = 3 // DESIGN.md section 8: 3 per group, then "Show all N"
const LIMIT = 50 // the server maximum: there is no "show more" paging
const TYPES = ['PAGE', 'SPACE', 'TEAM'] as const
type Type = (typeof TYPES)[number]
const LABEL: Record<Type, string> = { PAGE: 'Pages', SPACE: 'Spaces', TEAM: 'Teams' }

/** /app/search?q=&tag=&status=&type=: grouped results on /api/search (mockup search). */
export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''
  // Old bookmarks wrote ?status=draft and ?type=document: accept them, ignore anything else.
  const rawStatus = (params.get('status') ?? '').toUpperCase()
  const status = ['DRAFT', 'PUBLISHED'].includes(rawStatus) ? rawStatus : ''
  const rawType = (params.get('type') ?? '').toUpperCase().replace('DOCUMENT', 'PAGE')
  const type = TYPES.find((t) => t === rawType) // anything else = all
  const [text, setText] = useState(q)

  const set = (next: Record<string, string | undefined>) =>
    setParams((p) => {
      const u = new URLSearchParams(p)
      for (const [k, v] of Object.entries(next)) {
        if (v) u.set(k, v)
        else u.delete(k)
      }
      return u
    }, { replace: true })

  // The URL changed from outside (a tag link). Not when it only echoes what was typed: that would eat a trailing space.
  useEffect(() => setText((t) => (t.trim() === q.trim() ? t : q)), [q])
  useEffect(() => {
    if (text.trim() === q.trim()) return
    const t = setTimeout(() => set({ q: text.trim() }), DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const active = q.trim() !== '' || tag !== ''
  const hits = useQuery({
    queryKey: ['search', q.trim(), tag, status],
    queryFn: () => searchAll({ q: q.trim(), tag, publishState: status, limit: LIMIT }),
    enabled: active,
    retry: false,
  })
  // A page filter rules out spaces and teams, which have neither tags nor a publish state.
  const all = (hits.data ?? []).filter((h) => h.type === 'PAGE' || (!tag && !status))
  const counts = Object.fromEntries(TYPES.map((t) => [t, all.filter((h) => h.type === t).length])) as Record<Type, number>
  const shown = type ? [type] : TYPES.filter((t) => counts[t] > 0)

  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb"><span className={s.here}><Icon name="search" />Search</span></nav>
      </TopBar>
      <h1>Search</h1>

      <div className={s.controls}>
        <form role="search" className={s.big} onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }) }}>
          <Icon name="search" size={18} />
          <input type="search" aria-label="Search" maxLength={200} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Search by title, text or tag" className={s.bigInput} />
          <kbd className={s.kbd} aria-hidden="true">Enter</kbd>
        </form>
        <div className={s.toolbar}>
          <label className={s.fpill}>
            <span>Status:</span>
            <select aria-label="Status" value={status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <Icon name="chevron-down" size={14} />
          </label>
          {tag && (
            <span className={s.tagChip}>
              #{tag}
              <button type="button" aria-label={`Remove tag filter ${tag}`} onClick={() => set({ tag: undefined })}><Icon name="close" size={12} /></button>
            </span>
          )}
          {hits.isSuccess && all.length > 0 && (
            <div className={s.types}>
              <Segmented<'ALL' | Type> label="Result type" idPrefix="search" onPage value={type ?? 'ALL'}
                onChange={(v) => set({ type: v === 'ALL' ? undefined : v })}
                options={[{ value: 'ALL', label: 'All', count: all.length }, ...TYPES.map((t) => ({ value: t, label: LABEL[t], count: counts[t] }))]} />
            </div>
          )}
        </div>
      </div>

      <div id="search-panel" role="tabpanel" aria-labelledby={`search-tab-${type ?? 'ALL'}`} className={s.results}>
        {!active && (
          <div className={s.empty}>
            <h2 className={s.emptyTitle}>Find anything your teams have written</h2>
            <p>Search by title, text or tag. Press Ctrl K from any page to jump straight to a page.</p>
          </div>
        )}
        {active && hits.isPending && <Skeleton />}
        {hits.isError && (
          <p className={s.retry} role="alert">Search failed. {hits.error.message} <button type="button" onClick={() => void hits.refetch()}>Try again</button></p>
        )}
        {hits.isSuccess && (
          <>
            <p className="sr-only" aria-live="polite">{all.length} {all.length === 1 ? 'result' : 'results'}</p>
            {all.length === 0 ? (
              <div className={s.empty}>
                <h2 className={s.emptyTitle}>Nothing matches “{q.trim() || `#${tag}`}”</h2>
                <p>{tag || status ? 'Try removing a filter.' : 'Check the spelling or try a shorter word.'}</p>
                {(tag || status) && <button type="button" className={s.ghost} onClick={() => set({ tag: undefined, status: undefined })}>Clear filters</button>}
              </div>
            ) : shown.map((t) => {
              const rows = all.filter((h) => h.type === t)
              const part = type ? rows : rows.slice(0, GROUP_MAX)
              return (
                <section key={t} className={s.group} aria-labelledby={`g-${t}`}>
                  <div className={s.groupHead}>
                    <span className={`${s.headTile} ${s[`t${t}`]}`} aria-hidden="true"><Icon name={ICON[t]} size={14} /></span>
                    <h2 id={`g-${t}`}>{LABEL[t]}</h2>
                    <span className={s.count}>{rows.length}</span>
                    {!type && rows.length > part.length && (
                      <button type="button" className={s.showAll} onClick={() => set({ type: t })}>Show all {rows.length}<Icon name="arrow-right" size={14} /></button>
                    )}
                  </div>
                  {rows.length === 0
                    ? <p className={s.none}>No {LABEL[t].toLowerCase()} match “{q.trim() || `#${tag}`}”{tag || status ? ' with these filters' : ''}.</p>
                    : <ul className={s.list}>{part.map((h) => <Row key={h.nodeId ?? h.spaceId ?? h.teamId} hit={h} q={q} />)}</ul>}
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

const ICON = { PAGE: 'file', SPACE: 'folder', TEAM: 'users' } as const

function Row({ hit, q }: { hit: SearchHit; q: string }) {
  const title = hit.title || 'Untitled'
  const to = hit.type === 'PAGE' ? `/p/${hit.nodeId}` : hit.type === 'SPACE' ? `/s/${hit.spaceId}` : `/teams/${hit.teamId}`
  const where = hit.type === 'PAGE' ? [placeOf(hit.teamName, hit.spaceName), hit.path].filter(Boolean).join(' / ') : null
  return (
    <li className={s.res}>
      {hit.type === 'TEAM'
        ? <span className={s.teamTile}><TeamTile name={title} size={36} /></span>
        : <span className={`${s.tile} ${s[`t${hit.type}`]}`} aria-hidden="true"><Icon name={ICON[hit.type]} /></span>}
      <div className={s.body}>
        <span className={s.titleRow}>
          {/* The title link covers the whole row (::after); tag links sit above it. */}
          <Link to={to} className={s.title} title={title}>{markWords(title, q)}</Link>
          {hit.publishState === 'DRAFT' && <span className={s.pill}>Draft</span>}
          {hit.publishState === 'PUBLISHED' && <span className={`${s.pill} ${s.published}`}>Published</span>}
          {hit.archived && <span className={s.pill}>Archived</span>}
        </span>
        {hit.snippetHtml && <span className={s.snip}><Snippet html={hit.snippetHtml} /></span>}
        {(where || hit.updatedByName || hit.tags.length > 0 || hit.type !== 'PAGE') && (
          <span className={s.meta}>
            {where && <span className={s.chip}>{where}</span>}
            {hit.type === 'SPACE' && (hit.teamId ? hit.teamName : 'Private') && <span className={s.chip}>{hit.teamId ? hit.teamName : 'Private'}</span>}
            {hit.type === 'TEAM' && <span>Team</span>}
            {hit.updatedByName && <span className={s.editor}><Avatar name={hit.updatedByName} /><span className="sr-only">Last edited by {hit.updatedByName}</span></span>}
            {hit.updatedAt && <time dateTime={hit.updatedAt}>{timeAgo(hit.updatedAt)}</time>}
            {hit.tags.map((t) => (
              <Link key={t} className={s.tag} to={`/search?tag=${encodeURIComponent(t)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`}>#{t}</Link>
            ))}
          </span>
        )}
      </div>
    </li>
  )
}

function Skeleton() {
  return (
    <div className={s.group} aria-busy="true" aria-label="Searching">
      {[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}
    </div>
  )
}
