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
  const tabName = ({ pages: 'Pages', members: 'Members', requests: 'Join requests', trash: 'Trash' } as Record<string, string>)[pathname.split('/').pop() ?? ''] // list tabs show no big title
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
        <p role="alert">Couldn’t open this team: {summary.error.message}</p>
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
          {/* QA-07: ghost everywhere, so Members keeps one primary ("Create link") */}
          {(tab === 'overview' || tab === 'members' || tab === 'requests') && admin && <button type="button" className={s.ghostBtn} aria-label="Invite people" onClick={inviteTo}><Icon name="user-plus" /><span className={s.label}>Invite people</span></button>}
          {(tab === 'overview' || tab === 'pages') && canEdit && first && (
            <button type="button" className={s.primaryBtn} aria-label="New page" onClick={() => void create(null)}><Icon name="plus" /><span className={s.label}>New page</span></button>
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
        {/* D-05 C: under 640px this is a bottom tab bar; the icons only show there */}
        <NavLink to={base} end className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}><Icon name="home" className={s.tabIcon} />Overview</NavLink>
        <NavLink to={`${base}/pages`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}><Icon name="file" className={s.tabIcon} />Pages</NavLink>
        <NavLink to={`${base}/members`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}><Icon name="users" className={s.tabIcon} />Members</NavLink>
        {admin && (
          <NavLink to={`${base}/requests`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>
            <Icon name="inbox" className={s.tabIcon} />Requests{pending > 0 && <span className={s.count} aria-label={`${pending} waiting`}>{pending}</span>}
          </NavLink>
        )}
        <NavLink to={`${base}/trash`} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}><Icon name="trash" className={s.tabIcon} />Trash</NavLink>
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
