import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { createTeamSpace, getTeamPages } from '../api/teams'
import { DetailsPanel, useShellSlots } from '../app/ShellSlots'
import PageRow, { SkeletonRows } from '../dashboard/PageRow'
import { AvatarStack } from '../ui/Avatar'
import FormDialog from '../ui/FormDialog'
import Icon from '../ui/Icon'
import RolePill from '../ui/RolePill'
import Time from '../ui/timeAgo'
import { readPref, savePref } from './detailsPref'
import TeamDetails from './TeamDetails'
import TeamTitle from './TeamTitle'
import type { TeamContext } from './TeamLayout'
import s from './Overview.module.css'
import t from './Team.module.css'

const RECENT = 8
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Team overview: facts, spaces and the 8 newest pages. Members and activity live in the details panel. */
export default function TeamOverview() {
  const { teamId, summary, spaces, spacesLoaded, canEdit, admin } = useOutletContext<TeamContext>()
  const { detailsOpen, setDetailsOpen } = useShellSlots()
  const qc = useQueryClient()
  const [newSpace, setNewSpace] = useState(false)
  const pages = useQuery({ queryKey: ['team-pages', teamId, 'recent'], queryFn: () => getTeamPages(teamId, { sort: 'updated', size: RECENT }) })

  // Open by default, remembered per screen; closed again when leaving so the next screen starts without it.
  useEffect(() => {
    setDetailsOpen(readPref())
    return () => setDetailsOpen(false)
  }, [setDetailsOpen])

  async function addSpace(name: string, description: string) {
    await createTeamSpace(teamId, name, description)
    await Promise.all(['team-spaces', 'team-summary', 'team-pages', 'spaces'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    setNewSpace(false)
  }

  return (
    <div className={t.column}>
      <header className={s.head}>
        <TeamTitle teamId={teamId} name={summary.name} admin={admin} />
        {summary.description && <p className={s.desc}>{summary.description}</p>}
        <p className={s.facts}>
          <span className={s.fact}>
            <AvatarStack names={summary.firstMembers.map((m) => m.fullName)} />
            <span className={s.strong}>{plural(summary.memberCount, 'member')}</span>
          </span>
          <span className={s.fact}><Icon name="layers" />
            <span><span className={s.strong}>{plural(summary.spaceCount, 'space')}</span> · {plural(summary.pageCount, 'page')}</span>
          </span>
          <span className={s.fact}>Your role <RolePill role={summary.myRole} /></span>
          {summary.updatedAt && <span className={s.fact}><Icon name="clock" />Updated <Time iso={summary.updatedAt} /></span>}
        </p>
      </header>

      <section aria-labelledby="spaces-h">
        <div className={s.sectionHead}>
          <h2 id="spaces-h" className={s.sectionTitle}>Spaces</h2>
          <span className={s.count}>{summary.spaceCount}</span>
          {canEdit && <button type="button" className={s.headLink} onClick={() => setNewSpace(true)}><Icon name="plus" />New space</button>}
        </div>
        {!spacesLoaded ? (
          <ul className={s.spaces} aria-hidden="true">{[0, 1, 2].map((i) => <li key={i}><span className={`${t.skel} ${s.skelSpace}`} /></li>)}</ul>
        ) : spaces.length === 0 ? (
          <p className={s.empty}>No spaces yet.{canEdit ? ' Create one to start writing pages.' : ''}</p>
        ) : (
          <ul className={s.spaces}>
            {spaces.map((sp) => (
              <li key={sp.id}>
                <Link to={`/s/${sp.id}`} className={s.space}>
                  <span className={s.spaceName}><span className={s.dot} aria-hidden="true" />{sp.name}</span>
                  <span className={s.spaceMeta}>{sp.pageCount === 0 ? 'No pages yet' : `${plural(sp.pageCount, 'page')}${sp.draftCount ? ` · ${plural(sp.draftCount, 'draft')}` : ''}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-h">
        <div className={s.sectionHead}><h2 id="recent-h" className={s.sectionTitle}>Recently updated</h2></div>
        {pages.isPending ? <SkeletonRows n={4} />
          : pages.isError ? <p className={s.error} role="alert">Could not load the pages. <button type="button" className={t.linkBtn} onClick={() => void pages.refetch()}>Try again</button></p>
          : pages.data.items.length === 0 ? <p className={s.empty}>No pages yet. Pages created in this team’s spaces show up here.</p>
          : (
            <>
              <ul className={s.list}>
                {pages.data.items.map((p) => (
                  <PageRow key={p.id} id={p.id} title={p.title} color={p.color} location={p.spaceName} status={p.publishState}
                    avatar={p.lastEditorName ? { name: p.lastEditorName } : undefined} when={p.updatedAt} />
                ))}
              </ul>
              {pages.data.total > RECENT && <p className={s.viewAll}><Link to={`/teams/${teamId}/pages`} className={s.more}>View all {pages.data.total} pages →</Link></p>}
            </>
          )}
      </section>

      {newSpace && <FormDialog title="New space" label="Space name" noteLabel="What is this space for? (optional)" submitLabel="Create space" onSubmit={addSpace} onClose={() => setNewSpace(false)} />}
      {detailsOpen && <DetailsPanel><TeamDetails teamId={teamId} onClose={() => { savePref(false); setDetailsOpen(false) }} /></DetailsPanel>}
    </div>
  )
}

