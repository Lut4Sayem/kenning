import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getTeam, getTeamActivity, type TeamActivity } from '../api/teams'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import RolePill from '../ui/RolePill'
import { timeAgo } from '../ui/timeAgo'
import s from './Details.module.css'

const MEMBERS = 5
const VERB: Record<string, string> = {
  CREATE_NODE: 'created', PUBLISH_NODE: 'published', TRASH_NODE: 'moved to trash', ARCHIVE_NODE: 'archived',
  RESTORE_NODE: 'restored', UNARCHIVE_NODE: 'unarchived',
}
const verbOf = (a: TeamActivity) => VERB[a.action] ?? a.action.replace(/_NODE$/, '').toLowerCase().replace(/_/g, ' ')

/** The team overview's right panel: up to 5 members and the 5 newest events (DESIGN.md sections 4 and 8). */
export default function TeamDetails({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const team = useQuery({ queryKey: ['team', teamId], queryFn: () => getTeam(teamId) })
  const activity = useQuery({ queryKey: ['team-activity', teamId], queryFn: () => getTeamActivity(teamId, 5) })
  const members = team.data?.teamMembers ?? []

  return (
    <div className={s.panel}>
      <div className={s.top}>
        <h2 className={s.title}>Details</h2>
        <button type="button" className={s.close} aria-label="Close details" onClick={onClose}><Icon name="panel-right" /></button>
      </div>

      <section aria-labelledby="dm-h" className={s.section}>
        <div className={s.head}><h3 id="dm-h" className={s.label}>Members</h3><Link to={`/teams/${teamId}/members`} className={s.link}>Manage</Link></div>
        {team.isPending ? <div aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={`${s.skel} ${s.skelRow}`} />)}</div>
          : team.isError ? <p className={s.error} role="alert">Could not load members. <button type="button" className={s.retry} onClick={() => void team.refetch()}>Try again</button></p>
          : (
            <>
              <ul className={s.members}>
                {members.slice(0, MEMBERS).map((m) => (
                  <li key={m.userId} className={s.member}><Avatar name={m.fullName} /><span className={s.mname}>{m.fullName}</span><RolePill role={m.role} /></li>
                ))}
              </ul>
              {members.length > MEMBERS && <p className={s.more}><Link to={`/teams/${teamId}/members`} className={s.link}>+ {members.length - MEMBERS} more</Link></p>}
            </>
          )}
      </section>

      <section aria-labelledby="da-h" className={s.section}>
        <div className={s.head}>
          {/* TODO (release 1b): "View all" goes to the Inbox filtered to this team; until then it opens Members. */}
          <h3 id="da-h" className={s.label}>Activity</h3><Link to={`/teams/${teamId}/members`} className={s.link}>View all</Link>
        </div>
        {activity.isPending ? <div aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={`${s.skel} ${s.skelEvent}`} />)}</div>
          : activity.isError ? <p className={s.error} role="alert">Could not load activity. <button type="button" className={s.retry} onClick={() => void activity.refetch()}>Try again</button></p>
          : activity.data.length === 0 ? <p className={s.empty}>Nothing yet. Pages created or published in this team show up here.</p>
          : (
            <ul className={s.events}>
              {activity.data.map((a, i) => (
                <li key={i} className={s.event}>
                  <Avatar name={a.actorName ?? '?'} />
                  <div>
                    <p className={s.text}>
                      <span className={s.actor}>{a.actorName ?? 'Someone'}</span> {verbOf(a)}{' '}
                      {a.action === 'TRASH_NODE' ? <span className={s.target}>{a.targetTitle || 'Untitled'}</span>
                        : <Link to={`/p/${a.targetId}`} className={s.target}>{a.targetTitle || 'Untitled'}</Link>}
                    </p>
                    <p className={s.time}>{timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
