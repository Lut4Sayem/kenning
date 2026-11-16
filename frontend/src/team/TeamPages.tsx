import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { getTeam, getTeamPages, type TeamPageItem, type TeamSpace } from '../api/teams'
import { useCreatePage } from '../tree/useCreatePage'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { dotColour } from '../ui/pageColour'
import Popover from '../ui/Popover'
import { timeCompact } from '../ui/timeAgo'
import { useRemembered } from '../ui/useRemembered'
import type { TeamContext } from './TeamLayout'
import s from './Pages.module.css'
import t from './Team.module.css'

export const PAGE_SIZE = 25
type Sort = 'updated' | 'title'

/** Team "Pages" tab: every page I can see, filtered and sorted by the URL (links and Back keep working). */
export default function TeamPages() {
  const { teamId, spaces, canEdit, meId } = useOutletContext<TeamContext>()
  const [params, setParams] = useSearchParams()
  const status = ['DRAFT', 'PUBLISHED'].includes(params.get('status') ?? '') ? params.get('status')! : ''
  const space = params.get('space') ?? ''
  const editor = params.get('editor') ?? ''
  const sort: Sort = params.get('sort') === 'title' ? 'title' : 'updated'
  const grouped = params.get('group') !== '0'
  const pageNo = Math.max(1, Number(params.get('page')) || 1)

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k) }
    if (!('page' in changes)) next.delete('page') // any filter change starts again on page 1
    setParams(next)
  }

  const members = useQuery({ queryKey: ['team', teamId], queryFn: () => getTeam(teamId) })
  const pages = useQuery({
    queryKey: ['team-pages', teamId, { status, space, editor, sort, pageNo }],
    queryFn: () => getTeamPages(teamId, { status, spaceId: space, editedBy: editor, sort, page: pageNo - 1, size: PAGE_SIZE }),
  })

  const spaceName = spaces.find((x) => x.id === space)?.name ?? 'this space'
  const editorName = members.data?.teamMembers.find((m) => m.userId === editor)?.fullName ?? 'someone'
  const view = editor && editor === meId && !status ? 'mine' : !editor && status === 'DRAFT' ? 'drafts' : !editor && status === 'PUBLISHED' ? 'published' : !editor && !status ? 'all' : ''
  const filtered = Boolean(status || space || editor)
  const total = pages.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const views: [string, string, Record<string, string | null>][] = [
    ['all', 'All pages', { status: null, editor: null }], ['drafts', 'Drafts', { status: 'DRAFT', editor: null }],
    ['published', 'Published', { status: 'PUBLISHED', editor: null }], ['mine', 'Edited by me', { status: null, editor: meId ?? null }],
  ]

  const groups = grouped ? groupBySpace(pages.data?.items ?? [], spaces) : [{ space: null, items: pages.data?.items ?? [] }]

  return (
    <div>
      <div className={s.viewBar}>
        <div className={s.views} role="group" aria-label="View">
          {views.map(([id, label, change]) => (
            <button key={id} type="button" className={`${s.pill} ${view === id ? s.on : ''}`} aria-pressed={view === id} onClick={() => set(change)}>
              {id === 'mine' && <Icon name="user" />}{label}
            </button>
          ))}
        </div>
        {space && <Chip label={`Space is ${spaceName}`} onRemove={() => set({ space: null })} />}
        {editor && view !== 'mine' && <Chip label={`Edited by ${editorName}`} onRemove={() => set({ editor: null })} />}
        <div className={s.tools}>
          <Popover label="Filter" trigger={(p) => <button type="button" className={t.iconBtn} aria-label="Filter" title="Filter" {...p}><Icon name="filter" /></button>}>
            <div className={s.menu}>
              <label className={s.field}>Space
                <select value={space} onChange={(e) => set({ space: e.target.value || null })}>
                  <option value="">All spaces</option>{spaces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className={s.field}>Last edited by
                <select value={editor} onChange={(e) => set({ editor: e.target.value || null })}>
                  <option value="">Anyone</option>{(members.data?.teamMembers ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
                </select>
              </label>
            </div>
          </Popover>
          <Popover label="Display" trigger={(p) => <button type="button" className={t.iconBtn} aria-label="Display" title="Display" {...p}><Icon name="sliders" /></button>}>
            <div className={s.menu}>
              <label className={s.check}><input type="checkbox" checked={grouped} onChange={(e) => set({ group: e.target.checked ? null : '0' })} />Group by space</label>
              <fieldset className={s.radios}>
                <legend>Sort by</legend>
                <label className={s.check}><input type="radio" name="sort" checked={sort === 'updated'} onChange={() => set({ sort: null })} />Last edited</label>
                <label className={s.check}><input type="radio" name="sort" checked={sort === 'title'} onChange={() => set({ sort: 'title' })} />Title</label>
              </fieldset>
            </div>
          </Popover>
        </div>
      </div>

      <table className={s.table}>
        <thead>
          <tr className={s.cols}>
            <th scope="col"><Icon name="file" />Title{sort === 'title' && <Icon name="chevron-down" />}</th>
            <th scope="col" className={s.cStatus}><Icon name="circle" />Status</th>
            <th scope="col" className={s.cEditor}><Icon name="user" />Last edited by</th>
            <th scope="col" className={s.cTime}><Icon name="clock" />Edited{sort === 'updated' && <Icon name="chevron-down" />}</th>
            <th scope="col" className={s.cEnd}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        {pages.isPending ? (
          <tbody aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <tr key={i} className={s.row}><td className={s.cTitle}><span className={`${t.skel} ${s.skelRow}`} /></td></tr>)}</tbody>
        ) : pages.isError ? (
          <tbody><tr><td className={s.message}><p role="alert">Could not load the pages: {pages.error.message} <button type="button" className={t.linkBtn} onClick={() => void pages.refetch()}>Try again</button></p></td></tr></tbody>
        ) : total === 0 ? (
          <tbody><tr><td className={s.message}>
            {filtered ? <p>No pages match these filters. <button type="button" className={t.linkBtn} onClick={() => setParams(new URLSearchParams())}>Clear filters</button></p>
              : <p>No pages yet.{canEdit && spaces.length > 0 ? ' Use New page to write the first one.' : ''}</p>}
          </td></tr></tbody>
        ) : groups.map((g) => (
          <Fragment key={g.space?.id ?? 'all'}>
            {g.space ? <GroupBody space={g.space} items={g.items} canEdit={canEdit} /> : <tbody>{g.items.map((p) => <PageRowT key={p.id} p={p} />)}</tbody>}
          </Fragment>
        ))}
      </table>

      {pages.data && total > 0 && (
        <div className={s.foot}>
          <p className={s.summary}>{total} page{total === 1 ? '' : 's'}{grouped ? ' · grouped by space' : ''} · sorted by {sort === 'title' ? 'title' : 'last edited'}</p>
          {total > PAGE_SIZE && (
            <nav className={s.paging} aria-label="Pages">
              <button type="button" className={t.ghostBtn} disabled={pageNo <= 1} onClick={() => set({ page: String(pageNo - 1) === '1' ? null : String(pageNo - 1) })}>Previous</button>
              <span>Page {Math.min(pageNo, lastPage)} of {lastPage}</span>
              <button type="button" className={t.ghostBtn} disabled={pageNo >= lastPage} onClick={() => set({ page: String(pageNo + 1) })}>Next</button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}

function groupBySpace(items: TeamPageItem[], spaces: TeamSpace[]) {
  const order = new Map(spaces.map((x, i) => [x.id, i]))
  const by = new Map<string, TeamPageItem[]>()
  for (const p of items) by.set(p.spaceId, [...(by.get(p.spaceId) ?? []), p])
  return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
    .map(([id, list]) => ({ space: { id, name: list[0].spaceName }, items: list }))
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <span className={s.chip}>{label}<button type="button" aria-label={`Remove filter: ${label}`} onClick={onRemove}><Icon name="close" /></button></span>
}

function GroupBody({ space, items, canEdit }: { space: { id: string; name: string }; items: TeamPageItem[]; canEdit: boolean }) {
  const [open, toggle] = useRemembered(`kf.team.group.${space.id}`)
  const { create } = useCreatePage(space.id)
  return (
    <tbody>
      <tr className={s.group}>
        <td colSpan={5}>
          <button type="button" className={s.chev} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${space.name}`} onClick={toggle}>
            <Icon name="chevron-right" className={open ? s.chevOpen : ''} />
          </button>
          <span className={s.dot} aria-hidden="true" />
          <span className={s.gname}>{space.name}</span><span className={s.gcount}>{items.length}</span>
          {canEdit && <button type="button" className={s.gplus} aria-label={`New page in ${space.name}`} title="New page" onClick={() => void create(null)}><Icon name="plus" /></button>}
        </td>
      </tr>
      {open && items.map((p) => <PageRowT key={p.id} p={p} />)}
    </tbody>
  )
}

function PageRowT({ p }: { p: TeamPageItem }) {
  const published = p.publishState === 'PUBLISHED'
  return (
    <tr className={s.row}>
      <td className={s.cTitle}>
        <Link to={`/p/${p.id}`} className={s.titleLink}>
          <span className={s.dot} style={{ background: dotColour(p.color) }} aria-hidden="true" />
          <span className={s.title} title={p.title || 'Untitled'}>{p.title || 'Untitled'}</span>
          {p.parentTitle && <span className={s.parent}>in {p.parentTitle}</span>}
        </Link>
      </td>
      <td className={s.cStatus}><span className={`${s.circle} ${published ? s.pub : ''}`} aria-hidden="true" />{published ? 'Published' : 'Draft'}</td>
      <td className={s.cEditor}>{p.lastEditorName && <><Avatar name={p.lastEditorName} /><span className={s.ename}>{p.lastEditorName}</span></>}</td>
      <td className={s.cTime}><time dateTime={p.updatedAt}>{timeCompact(p.updatedAt)}</time></td>
      <td className={s.cEnd} />
    </tr>
  )
}
