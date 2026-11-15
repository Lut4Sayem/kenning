import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getMe } from '../api/spaces'
import { getJoinRequests, getTeamSpaces, getTeamSummary, type JoinRequest, type TeamSpace, type TeamSummary } from '../api/teams'
import { TopBar, useShellSlots } from '../app/ShellSlots'
import { useCreatePage } from '../tree/useCreatePage'
import Icon from '../ui/Icon'
import TeamTile from '../ui/TeamTile'
import { savePref } from './detailsPref'
import s from './Team.module.css'

export interface TeamContext {
  teamId: string
  summary: TeamSummary
  spaces: TeamSpace[]
  spacesLoaded: boolean
  admin: boolean
  canEdit: boolean
  meId: string | undefined
  requests: JoinRequest[]
  requestsLoaded: boolean
  refetchRequests: () => Promise<unknown>
}

/** /teams/:teamId: top bar with the team, the slim sub-navigation, and the tab's content. */
export default function TeamLayout() {
  const { teamId = '' } = useParams()
  const { pathname } = useLocation()
  const tabName = ({ pages: 'Pages', members: 'Members', requests: 'Join requests' } as Record<string, string>)[pathname.split('/').pop() ?? ''] // list tabs show no big title
  const nav = useNavigate()
  const { detailsOpen, setDetailsOpen } = useShellSlots()
  const summary = useQuery({ queryKey: ['team-summary', teamId], queryFn: () => getTeamSummary(teamId), retry: false })
  const spaces = useQuery({ queryKey: ['team-spaces', teamId], queryFn: () => getTeamSpaces(teamId), enabled: summary.isSuccess })
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const admin = summary.data?.myRole === 'ADMIN'
  const canEdit = summary.data?.myRole === 'ADMIN' || summary.data?.myRole === 'EDITOR'
  const requests = useQuery({ queryKey: ['join-requests', teamId], queryFn: () => getJoinRequests(teamId), enabled: admin })
  const first = spaces.data?.[0]
  const { create } = useCreatePage(first?.id ?? '')

  const base = `/teams/${teamId}`
  const tab = pathname === base || pathname === `${base}/` ? 'overview' : pathname.slice(base.length + 1).split('/')[0]
  const pending = requests.data?.length ?? 0

  if (summary.isError) {
    return (
      <div className={s.state}>
        <p role="alert">Couldn't open this team: {summary.error.message}</p>
        <p><button type="button" className={s.linkBtn} onClick={() => void summary.refetch()}>Try again</button> · <Link to="/" className={s.link}>Go to Home</Link></p>
      </div>
    )
  }

  const toggleDetails = () => { savePref(!detailsOpen); setDetailsOpen(!detailsOpen) }
  const inviteTo = () => nav(`${base}/members#invite`)

  return (
    <div data-bleed>
      <TopBar>
        <span className={s.crumb}>
          {summary.data ? <><TeamTile name={summary.data.name} /><span className={s.crumbName}>{summary.data.name}</span></> : <span className={`${s.skel} ${s.skelName}`} />}
        </span>
        <span className={s.actions}>
          {tab === 'overview' && admin && <button type="button" className={s.ghostBtn} onClick={inviteTo}><Icon name="user-plus" />Invite</button>}
          {(tab === 'members' || tab === 'requests') && admin && <button type="button" className={s.primaryBtn} onClick={inviteTo}><Icon name="user-plus" />Invite people</button>}
          {(tab === 'overview' || tab === 'pages') && canEdit && first && (
            <button type="button" className={s.primaryBtn} onClick={() => void create(null)}><Icon name="plus" />New page</button>
          )}
          {tab === 'overview' && (
            <button type="button" className={s.iconBtn} aria-label="Details" aria-pressed={detailsOpen} title="Details" onClick={toggleDetails}>
              <Icon name="panel-right" />
            </button>
          )}
        </span>
      </TopBar>

      {tabName && summary.data && <h1 className="sr-only">{summary.data.name}: {tabName}</h1>}
      <nav className={s.subnav} aria-label="Team">
        <NavLink to={base} end className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>Overview</NavLink>
        <NavLink to={`${base}/pages`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>Pages</NavLink>
        <NavLink to={`${base}/members`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>Members</NavLink>
        {admin && (
          <NavLink to={`${base}/requests`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>
            Requests{pending > 0 && <span className={s.count} aria-label={`${pending} waiting`}>{pending}</span>}
          </NavLink>
        )}
        {first && <Link to={`/s/${first.id}/trash`} className={s.tab}>Trash</Link>}
      </nav>

      {summary.data ? (
        <Outlet context={{
          teamId, summary: summary.data, spaces: spaces.data ?? [], spacesLoaded: spaces.isSuccess, admin, canEdit, meId: me.data?.id,
          requests: requests.data ?? [], requestsLoaded: requests.isSuccess, refetchRequests: () => requests.refetch(),
        } satisfies TeamContext} />
      ) : (
        <div className={s.column} aria-busy="true"><span className={`${s.skel} ${s.skelTitle}`} /><span className={`${s.skel} ${s.skelLine}`} /></div>
      )}
    </div>
  )
}
