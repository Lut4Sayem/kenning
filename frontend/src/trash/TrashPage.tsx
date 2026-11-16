import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  deleteForever,
  getArchived,
  getTeamArchived,
  getTeamTrash,
  getTrash,
  restoreBranch,
  unarchiveNode,
  type Branch,
  type BranchList,
  type SpaceBranches,
} from '../api/nodes'
import { getMySpaces } from '../api/spaces'
import { TopBar } from '../app/ShellSlots'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import Segmented from '../ui/Segmented'
import Time from '../ui/timeAgo'
import { confirmDeleteForever } from './ConfirmTrashDialog'
import s from './Trash.module.css'

const DAY = 24 * 60 * 60 * 1000
const PAGE = 25 // DESIGN.md section 8: 25, then "Load more"
const URGENT_DAYS = 7

const daysUntil = (purgeAt: string, now: number) => Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now) / DAY))

export function daysLeft(purgeAt: string | null, now = Date.now()): string {
  if (!purgeAt) return ''
  const days = daysUntil(purgeAt, now)
  return days === 1 ? '1 day' : `${days} days`
}

type Tab = 'trash' | 'archived'
/** A row knows its space: the team trash mixes spaces (QA-34). */
type Row = Branch & { spaceId: string; spaceName: string; canPurge: boolean }

const asGroup = (spaceId: string) => (l: BranchList): SpaceBranches[] => [{ spaceId, spaceName: '', ...l }]

/** Trash and Archived tabs of one space (`/s/:spaceId/trash`) or of every space of a team (`/teams/:teamId/trash`). */
export default function TrashPage() {
  const { spaceId = '', teamId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'archived' ? 'archived' : 'trash'
  const qc = useQueryClient()
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const space = spaces.data?.find((x) => x.id === spaceId)
  const spaceName = space?.name ?? 'this space'
  const teamName = spaces.data?.find((x) => x.teamId === teamId)?.teamName
  const scope = teamId ? `all spaces of ${teamName ?? 'the team'}` : spaceName
  // The team lists come grouped by space; a space's list becomes one group, so both render the same way.
  const trash = useQuery({
    queryKey: teamId ? ['team-trash', teamId] : ['trash', spaceId],
    queryFn: () => (teamId ? getTeamTrash(teamId) : getTrash(spaceId).then(asGroup(spaceId))),
    retry: false,
  })
  const archived = useQuery({
    queryKey: teamId ? ['team-archived', teamId] : ['archived', spaceId],
    queryFn: () => (teamId ? getTeamArchived(teamId) : getArchived(spaceId).then(asGroup(spaceId))),
    retry: false,
  })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE)

  const active = tab === 'trash' ? trash : archived
  const refresh = (b: Row) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['trash', b.spaceId] }),
      qc.invalidateQueries({ queryKey: ['archived', b.spaceId] }),
      qc.invalidateQueries({ queryKey: ['tree', b.spaceId] }),
      qc.invalidateQueries({ queryKey: ['team-trash'] }),
      qc.invalidateQueries({ queryKey: ['team-archived'] }),
    ])

  const restore = useMutation({
    mutationFn: (b: Row) => (tab === 'trash' ? restoreBranch(b.id) : unarchiveNode(b.id)),
    onSuccess: async (result, b) => {
      setError('')
      setNotice(
        result.movedToTop
          ? `"${b.title || 'Untitled'}" was restored to the top level of ${b.spaceName}, because its parent was deleted or is in the trash.`
          : `"${b.title || 'Untitled'}" was restored.`,
      )
      await refresh(b)
    },
    onError: (e) => setError(e.message),
  })
  const forever = useMutation({
    mutationFn: async (b: Row) => {
      if (!(await confirmDeleteForever(b.title, b.descendantCount))) return false
      await deleteForever(b.id)
      return true
    },
    onSuccess: async (done, b) => {
      setError('')
      if (done) {
        setNotice('Deleted forever.')
        await refresh(b)
      }
    },
    onError: (e) => setError(e.message),
  })

  const canPurgeAny = tab === 'trash' && !!trash.data?.some((g) => g.canPurge)
  const needle = filter.trim().toLowerCase()
  const rows = (d?: SpaceBranches[]): Row[] =>
    (d ?? []).flatMap((g) => g.items.map((b) => ({ ...b, spaceId: g.spaceId, spaceName: teamId ? g.spaceName : spaceName, canPurge: g.canPurge })))
  const all = rows(active.data).filter((b) => !needle || (b.title || 'Untitled').toLowerCase().includes(needle))
  const items = all.slice(0, shown)
  const now = Date.now()
  const urgent = (b: Branch) => tab === 'trash' && !!b.purgeAt && daysUntil(b.purgeAt, now) <= URGENT_DAYS
  const groups: { key: string; label: string; items: Row[] }[] = teamId
    ? (active.data ?? []).map((g) => ({ key: g.spaceId, label: g.spaceName, items: items.filter((b) => b.spaceId === g.spaceId) }))
    : tab === 'trash'
      ? items.some(urgent)
        ? [{ key: 'soon', label: 'Gone for good this week', items: items.filter(urgent) }, { key: 'later', label: 'Later', items: items.filter((b) => !urgent(b)) }]
        : [{ key: 'later', label: '', items }] // QA-36: "Later" on its own reads oddly
      : [{ key: 'all', label: '', items }]
  const switchTab = (t: Tab) => { setParams(t === 'trash' ? {} : { tab: t }); setShown(PAGE); setNotice(''); setError('') }

  const row = (b: Row) => {
    const soon = urgent(b)
    const where = [b.spaceName, ...b.path.map((p) => p.title || 'Untitled')].join(' / ')
    return (
      <li key={b.id} className={`${s.item} ${soon ? s.urgent : ''}`}>
        <span className={`${s.tile} ${soon ? s.tileUrgent : ''}`} aria-hidden="true"><Icon name="doc-lines" /></span>
        <span className={s.main}>
          <span className={s.name}>
            <span className={s.title} title={b.title || 'Untitled'}>{b.title || 'Untitled'}</span>
            {b.descendantCount > 0 && <span className={s.subs}>+ {b.descendantCount} sub-page{b.descendantCount === 1 ? '' : 's'}</span>}
          </span>
          <span className={s.was}>Was in {where}</span>
          {b.parentGone && <span className={s.warn}>Its parent is also deleted or archived, so it will come back at the top of {b.spaceName}.</span>}
        </span>
        <span className={s.by}>
          <Avatar name={b.by?.name ?? '?'} />
          <span><b>{b.by?.name ?? 'Unknown'}</b>{' '}{tab === 'trash' ? 'deleted' : 'archived'} <Time iso={b.at} /></span>
        </span>
        {tab === 'trash' && b.purgeAt && (
          <span className={`${s.left} ${soon ? s.leftSoon : ''}`} title="Deleted for good after 30 days in the trash">
            {`${daysLeft(b.purgeAt, now)} left`}
          </span>
        )}
        <span className={s.actions}>
          {b.canRestore && (
            <button type="button" className={s.restore} onClick={() => restore.mutate(b)} disabled={restore.isPending}>
              <Icon name="restore" size={14} />{tab === 'trash' ? 'Restore' : 'Unarchive'}
            </button>
          )}
          {tab === 'trash' && b.canPurge && (
            <button type="button" className={s.purge} aria-label="Delete forever" title="Delete forever" onClick={() => forever.mutate(b)} disabled={forever.isPending}>
              <Icon name="trash" />
            </button>
          )}
        </span>
      </li>
    )
  }

  return (
    <div className={s.wrap} data-bleed>
      {!teamId && <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb">
          {space?.teamId && <><Link to={`/teams/${space.teamId}`}>{space.teamName}</Link><span aria-hidden="true">/</span></>}
          {space && <><Link to={`/s/${space.id}`}>{space.name}</Link><span aria-hidden="true">/</span></>}
          <span className={s.here} aria-current="page"><Icon name="trash" size={14} />Trash</span>
        </nav>
      </TopBar>}

      <div className={s.hero}>
        <h1>{tab === 'trash' ? 'Trash' : 'Archived'}</h1>
        <p className={s.lead}>
          {tab === 'trash'
            ? `Deleted pages from ${scope} stay here for 30 days, then they are gone for good.`
            : `Archived pages from ${scope} are read-only and still show up in search. Unarchiving brings back the page and its sub-pages.`}
        </p>
      </div>

      <div className={s.toolbar}>
        <Segmented<Tab> label="Trash and archive" idPrefix="trash" onPage value={tab} onChange={switchTab} options={[
          { value: 'trash', label: 'Trash', count: trash.data && rows(trash.data).length },
          { value: 'archived', label: 'Archived', count: archived.data && rows(archived.data).length },
        ]} />
        <label className={s.filter}>
          <Icon name="search" size={14} />
          <span className="sr-only">Filter by title</span>
          <input type="search" placeholder="Filter by title" value={filter} maxLength={100} onChange={(e) => { setFilter(e.target.value); setShown(PAGE) }} />
        </label>
      </div>

      <div id="trash-panel" role="tabpanel" aria-labelledby={`trash-tab-${tab}`} className={s.panel}>
        <p role="status" className={s.notice}>{notice}</p>
        {error && <p role="alert" className={s.error}>{error}</p>}
        {active.isPending && <div className={s.group} aria-busy="true" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>}
        {active.isError && (
          <p role="alert" className={s.error}>Could not load the {tab === 'trash' ? 'trash' : 'archived pages'}. {active.error.message} <button type="button" onClick={() => void active.refetch()}>Try again</button></p>
        )}
        {active.isSuccess && all.length === 0 && (
          <p className={s.empty}>
            {needle ? `No page title matches “${filter.trim()}”.`
              : tab === 'trash' ? `The trash is empty. Pages you delete from ${scope} wait here for 30 days.`
                : `Nothing is archived. Archive a page from its … menu to keep it read-only.`}
          </p>
        )}
        {groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.key} className={s.group} aria-labelledby={g.label ? `tg-${g.key}` : undefined} aria-label={g.label ? undefined : tab === 'trash' ? 'Pages in the trash' : 'Archived pages'}>
            {g.label && (
              <h2 id={`tg-${g.key}`} className={s.groupHead}>
                {!teamId && <span className={g.key === 'soon' ? s.clockSoon : s.clock}><Icon name="clock" size={14} /></span>}
                {g.label}<span className={s.count}>{g.items.length}</span>
              </h2>
            )}
            <ul className={s.list}>{g.items.map(row)}</ul>
          </section>
        ))}
        {all.length > items.length && (
          <button type="button" className={s.more} onClick={() => setShown((n) => n + PAGE)}>Load more</button>
        )}
        {tab === 'trash' && !canPurgeAny && trash.isSuccess && all.length > 0 && <p className={s.note}>Only team admins can delete forever.</p>}
      </div>
    </div>
  )
}
