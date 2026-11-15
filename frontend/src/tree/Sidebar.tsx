import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { createNode } from '../api/nodes'
import { getMe, getMySpaces, getMyTeams, type MySpace, type MyTeam } from '../api/spaces'
import Icon from '../ui/Icon'
import { initialOf, initialsOf, tintOf } from '../ui/tint'
import PageTree from './PageTree'
import s from './Sidebar.module.css'

const cx = (...c: (string | false)[]) => c.filter(Boolean).join(' ')

/** Open/closed state that survives a reload. Storage can be blocked: then it just starts open. */
function useRemembered(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0'
    } catch {
      return true
    }
  })
  const toggle = () => {
    try {
      localStorage.setItem(key, open ? '0' : '1')
    } catch {
      // ignore: the choice just is not remembered
    }
    setOpen(!open)
  }
  return [open, toggle]
}

// Loaded on demand: sending unsaved copies needs the editor code, which the rest of the shell does not.
const logOut = (userId: string) =>
  import('../editor/logout').then(
    (m) => m.logOut(userId),
    () => window.alert('Could not log out. Check your connection and try again.'), // offline: the code could not load
  )

export default function Sidebar({ onSearch }: { onSearch: () => void }) {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const teams = useQuery({ queryKey: ['teams'], queryFn: getMyTeams })
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const activeId = useMatch('/p/:nodeId')?.params.nodeId
  const priv = (spaces.data ?? []).find((sp) => sp.ownerType === 'USER')
  const name = me.data?.fullName ?? ''

  async function newPrivatePage() {
    if (!priv) return
    try {
      const created = await createNode(priv.id, { parentId: null })
      await qc.invalidateQueries({ queryKey: ['tree', priv.id] })
      navigate(`/p/${created.id}`)
    } catch {
      // the Private section's own "New page" row shows the server message; this shortcut stays quiet
    }
  }

  return (
    <nav className={s.sidebar} aria-label="Workspace">
      <div className={s.top}>
        <AccountMenu name={name} userId={me.data?.id} />
        <button type="button" className={s.iconBtn} aria-label="New private page" title="New page" disabled={!priv} onClick={() => void newPrivatePage()}>
          <Icon name="edit" />
        </button>
      </div>

      <button type="button" className={s.search} onClick={onSearch}>
        <Icon name="search" /><span>Search</span><kbd className={s.kbd}>Ctrl K</kbd>
      </button>

      <div className={s.nav}>
        <NavLink to="/" end className={({ isActive }) => cx(s.navLink, isActive && s.active)}><Icon name="home" />Home</NavLink>
        <NavLink to="/recent" className={({ isActive }) => cx(s.navLink, isActive && s.active)}><Icon name="clock" />Recent</NavLink>
      </div>

      <h2 className={s.label}>Your teams</h2>
      {(teams.data ?? []).map((t) => (
        <TeamSection key={t.teamId} team={t} spaces={(spaces.data ?? []).filter((sp) => sp.ownerType === 'TEAM' && sp.teamId === t.teamId)}
          loaded={spaces.isSuccess} activeId={activeId} />
      ))}
      {teams.isSuccess && teams.data.length === 0 && <p className={s.note}>You are not in a team yet.</p>}

      {priv && (
        <section data-space={priv.id} aria-label="Private">
          <h2 className={s.label}>Private</h2>
          <PageTree spaceId={priv.id} spaceName={priv.name} activeId={activeId} />
          <SpaceLinks spaceId={priv.id} />
        </section>
      )}

      <div className={s.foot}>
        {me.data && (
          <Link to="/profile" className={s.me}><span className={s.avatar} aria-hidden="true">{initialsOf(name)}</span>{name}</Link>
        )}
      </div>
    </nav>
  )
}

function AccountMenu({ name, userId }: { name: string; userId?: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = () => { setOpen(false); btn.current?.focus() }

  return (
    <div ref={box} style={{ display: 'contents' }} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close() } }}>
      <button ref={btn} type="button" className={s.account} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.avatar} aria-hidden="true">{initialsOf(name)}</span>
        <span className={s.name}>{name || 'Account'}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className={s.menu} role="menu" aria-label="Account">
          <Link to="/profile" role="menuitem" className={s.menuItem}><Icon name="user" />Profile</Link>
          <button type="button" role="menuitem" className={s.menuItem} disabled={!userId} onClick={() => { setOpen(false); if (userId) void logOut(userId) }}>
            <Icon name="logout" />Log out
          </button>
        </div>
      )}
    </div>
  )
}

function TeamSection({ team, spaces, loaded, activeId }: { team: MyTeam; spaces: MySpace[]; loaded: boolean; activeId?: string }) {
  const [open, toggle] = useRemembered(`kf.sidebar.team.${team.teamId}`)
  const label = team.teamName || 'Untitled team'
  const tint = tintOf(label)
  return (
    <section className={s.group} aria-label={label}>
      <div className={s.groupRow}>
        <button type="button" className={s.chevBtn} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} onClick={toggle}>
          <Icon name="chevron-right" className={cx(s.chev, open && s.open)} />
        </button>
        <span className={s.tile} aria-hidden="true" style={{ background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)` }}>{initialOf(label)}</span>
        <Link to={`/teams/${team.teamId}`} className={cx(s.groupLink, s.teamLink)}>{label}</Link>
      </div>
      {open && (
        <div className={s.nested}>
          {spaces.map((sp) => <SpaceSection key={sp.id} space={sp} activeId={activeId} />)}
          {loaded && spaces.length === 0 && <p className={s.note}>No spaces in this team yet.</p>}
        </div>
      )}
    </section>
  )
}

function SpaceSection({ space, activeId }: { space: MySpace; activeId?: string }) {
  const [open, toggle] = useRemembered(`kf.sidebar.space.${space.id}`)
  return (
    <section className={s.group} data-space={space.id} aria-label={space.name}>
      <div className={s.groupRow}>
        <button type="button" className={s.chevBtn} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${space.name}`} onClick={toggle}>
          <Icon name="chevron-right" className={cx(s.chev, open && s.open)} />
        </button>
        <Link to={`/s/${space.id}`} className={s.groupLink}>{space.name}</Link>
      </div>
      {open && (
        <>
          <PageTree spaceId={space.id} spaceName={space.name} activeId={activeId} />
          <SpaceLinks spaceId={space.id} />
        </>
      )}
    </section>
  )
}

// shortcut: Trash and Archived are per space today, so they sit under each space; a global Trash comes with its own route
function SpaceLinks({ spaceId }: { spaceId: string }) {
  return (
    <>
      <Link to={`/s/${spaceId}/trash?tab=archived`} className={s.quiet}>Archived</Link>
      <Link to={`/s/${spaceId}/trash`} className={s.quiet}>Trash</Link>
    </>
  )
}
