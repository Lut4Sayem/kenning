import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useOutletContext } from 'react-router-dom'
import { createInvite, getInvite, getTeam, removeMember, setRole, turnOffInvite, type Member } from '../api/teams'
import Avatar from '../ui/Avatar'
import { confirmDialog } from '../ui/ConfirmDialog'
import Icon from '../ui/Icon'
import Popover from '../ui/Popover'
import RolePill, { roleLabel } from '../ui/RolePill'
import { timeAgo } from '../ui/timeAgo'
import JoinRequests from './JoinRequests'
import type { TeamContext } from './TeamLayout'
import s from './Members.module.css'
import t from './Team.module.css'

const ROLES = ['ADMIN', 'EDITOR', 'VIEWER']

/** Team "Members" tab: the member list on the left, join requests and the invite link beside it (admins). */
export default function TeamMembers() {
  const { teamId, admin, meId } = useOutletContext<TeamContext>()
  const qc = useQueryClient()
  const team = useQuery({ queryKey: ['team', teamId], queryFn: () => getTeam(teamId) })
  const [find, setFind] = useState('')
  const [error, setError] = useState('')
  const members = team.data?.teamMembers ?? []
  const needle = find.trim().toLowerCase()
  const shown = members.filter((m) => !needle || m.fullName.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))

  const refresh = () => Promise.all(['team', 'team-summary', 'teams'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
  const run = (fn: () => Promise<unknown>) => fn().then(() => setError(''), (e: Error) => setError(e.message))

  async function changeRole(m: Member, role: string) {
    if (role === m.role) return
    if (role === 'ADMIN' && !(await confirmDialog({ title: `Make ${m.fullName} an admin?`, confirmLabel: 'Make admin' }))) return
    await run(async () => { await setRole(teamId, m.userId, role); await refresh() })
  }
  async function remove(m: Member) {
    if (!(await confirmDialog({ title: `Remove ${m.fullName}?`, confirmLabel: 'Remove member', danger: true }))) return
    await run(async () => { await removeMember(teamId, m.userId); await refresh() })
  }

  return (
    <div className={`${t.column} ${s.cols}`}>
      <section aria-labelledby="members-h" className={s.main}>
        <div className={s.head}>
          <h2 id="members-h" className={s.title}>Members</h2>
          {team.data && <span className={s.count}>{members.length}</span>}
          <label className={s.find}>
            <Icon name="search" /><span className="sr-only">Find a member</span>
            <input type="search" placeholder="Find a member" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
        </div>
        {error && <p className={s.error} role="alert">{error}</p>}
        {team.isPending ? <div aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={`${t.skel} ${s.skelRow}`} />)}</div>
          : team.isError ? <p className={s.error} role="alert">Could not load the members: {team.error.message} <button type="button" className={t.linkBtn} onClick={() => void team.refetch()}>Try again</button></p>
          : shown.length === 0 ? <p className={s.empty}>No member matches "{find.trim()}".</p>
          : (
            <ul className={s.list}>
              {shown.map((m) => {
                const self = m.userId === meId
                return (
                  <li key={m.userId} className={s.row}>
                    <Avatar name={m.fullName} size={28} me={self} />
                    <span className={s.who}>
                      <span className={s.name}>{m.fullName}{self && ' (you)'}</span>
                      <span className={s.email}>{m.email}</span>
                    </span>
                    {admin && !self ? (
                      <Popover label={`Role of ${m.fullName}`} trigger={(p) => (
                        <button type="button" className={`${s.roleBtn} ${s[m.role]}`} aria-label={`Role of ${m.fullName}: ${roleLabel(m.role)}`} {...p}>
                          {roleLabel(m.role)}<Icon name="chevron-down" />
                        </button>
                      )}>
                        {(close) => ROLES.map((r) => (
                          <button key={r} type="button" className={s.option} aria-pressed={r === m.role} onClick={() => { close(); void changeRole(m, r) }}>
                            <span className={s.tick}>{r === m.role && <Icon name="check" />}</span>{roleLabel(r)}
                          </button>
                        ))}
                      </Popover>
                    ) : <RolePill role={m.role} />}
                    {admin && !self ? <button type="button" className={s.remove} aria-label={`Remove ${m.fullName}`} onClick={() => void remove(m)}><Icon name="close" /></button> : <span className={s.removeGap} />}
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      {admin && (
        <aside className={s.side} aria-label="Joining">
          <JoinRequests />
          <InviteBox />
        </aside>
      )}
    </div>
  )
}

/** Requests tab: the same box, full width. Only admins can answer, so anyone else is sent back to Members. */
export function TeamRequests() {
  const { admin, teamId } = useOutletContext<TeamContext>()
  if (!admin) return <Navigate to={`/teams/${teamId}/members`} replace />
  return <div className={t.column}><JoinRequests full /></div>
}

function InviteBox() {
  const { teamId } = useOutletContext<TeamContext>()
  const qc = useQueryClient()
  // The link lives on the server (QA-03): one per team, so a reload shows the same one.
  const invite = useQuery({ queryKey: ['invite', teamId], queryFn: () => getInvite(teamId) })
  const link = invite.data ? `${location.origin}/app/join/${invite.data.inviteCode}` : ''
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLElement>(null)
  const { hash } = useLocation()

  // "Invite people" in the top bar lands here: scroll to the box and put focus on its first control.
  useEffect(() => {
    if (hash !== '#invite' || !box.current) return
    box.current.scrollIntoView?.({ block: 'nearest' })
    box.current.querySelector<HTMLElement>('button, input')?.focus()
  }, [hash])

  async function change(fn: () => Promise<unknown>, failed: string) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : failed)
    }
    setBusy(false)
  }
  const create = () => change(async () => qc.setQueryData(['invite', teamId], await createInvite(teamId)), 'Could not create the link')
  async function turnOff() {
    if (!(await confirmDialog({ title: 'Turn off the invite link?', body: 'People who have it can no longer ask to join. You can create a new link later.', confirmLabel: 'Turn off', danger: true }))) return
    await change(async () => { await turnOffInvite(teamId); qc.setQueryData(['invite', teamId], null) }, 'Could not turn off the link')
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      return setError('Could not copy. Select the link and copy it by hand.')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section ref={box} id="invite" className={s.invite} aria-labelledby="invite-h">
      <h2 id="invite-h" className={s.boxTitle}>Invite link</h2>
      <p className={s.note}>Anyone with this link can ask to join. You approve each request.</p>
      {link ? (
        <>
          <div className={s.linkField}>
            <input readOnly aria-label="Invite link address" value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className={s.copy} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className={s.live} aria-live="polite">{copied ? 'Link copied' : ''}</p>
          {invite.data?.createdAt && (
            <p className={s.note}>Created{invite.data.createdByName ? ` by ${invite.data.createdByName}` : ''} {timeAgo(invite.data.createdAt)}</p>
          )}
          <p className={s.note}>A new link replaces this one. The old link stops working.</p>
          <div className={s.linkActions}>
            <button type="button" className={t.linkBtn} disabled={busy} onClick={() => void create()}>Create a new link</button>
            <button type="button" className={t.linkBtn} disabled={busy} onClick={() => void turnOff()}>Turn off link</button>
          </div>
        </>
      ) : invite.isPending ? <span className={`${t.skel} ${s.skelRow}`} aria-hidden="true" />
        : <button type="button" className={s.create} disabled={busy} onClick={() => void create()}>Create link</button>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  )
}
