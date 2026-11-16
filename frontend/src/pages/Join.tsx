import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import Icon from '../ui/Icon'
import { initialOf, initialsOf, tintOf } from '../ui/tint'
import { AuthLayout, FormError, SubmitButton } from './AuthLayout'
import s from './Join.module.css'
import { DEFAULT_NEXT } from './safeNext'

type Preview = { teamName: string; memberCount: number; invitedByName: string | null; hasPendingRequest?: boolean; isMember?: boolean; teamId?: string | null }
type Me = { fullName?: string; email?: string }
type Problem = { title: string; message: string; home?: boolean }

const tint = (name: string) => ({ background: `var(--tint-${tintOf(name)}-bg)`, color: `var(--tint-${tintOf(name)}-fg)` })
const WAITING = "You've already asked to join. It's waiting for approval."
const NOT_FOUND: Problem = {
  title: 'This invite doesn’t work',
  message: 'We couldn’t find this invite. It may have been replaced; ask for a new link.',
  home: true,
}

function TeamBlock({ preview }: { preview: Preview }) {
  const n = preview.memberCount
  return (
    <div className={s.team}>
      <span className={s.tile} aria-hidden="true" style={tint(preview.teamName)}>{initialOf(preview.teamName)}</span>
      <div className={s.teamText}>
        <span className={s.teamName}>{preview.teamName}</span>
        <span>{n} {n === 1 ? 'member' : 'members'}{preview.invitedByName ? ` · invited by ${preview.invitedByName}` : ''}</span>
      </div>
    </div>
  )
}

function TeamSkeleton() {
  return (
    <div className={s.team} aria-busy="true">
      <span className={s.skelTile} aria-hidden="true" />
      <span className={s.skelText} aria-hidden="true"><span className={s.skelLine} /><span className={s.skelLine} /></span>
      <span className={s.sr}>Loading invite…</span>
    </div>
  )
}

export default function Join() {
  const { code = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<Preview | null>(null) // null once loaded = the preview failed (not a 404)
  const [me, setMe] = useState<Me | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    // A 401 on either call sends them to login and back via ?next=
    Promise.allSettled([
      api<Me>('/api/me'),
      api<Preview>(`/api/team-invites/${encodeURIComponent(code)}`),
    ]).then(([m, p]) => {
      if (!live) return
      if (p.status === 'rejected' && p.reason instanceof ApiError && p.reason.status === 404) setProblem(NOT_FOUND)
      else if (m.status === 'rejected') setProblem({ title: 'Join a team', message: (m.reason as Error).message })
      else {
        setMe(m.value)
        if (p.status === 'fulfilled') {
          setPreview(p.value)
          if (p.value.hasPendingRequest) setNotice(WAITING) // asked before: no second "Ask to join" (QA-05)
        }
      }
      setLoading(false)
    })
    return () => { live = false }
  }, [code])

  async function join(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      await api(`/api/team-invites/${encodeURIComponent(code)}/join`, { method: 'POST' })
      setNotice('Request sent. A team admin has to approve it.')
    } catch (err) {
      const x = err as ApiError
      if (x.status === 409 && /already a member/i.test(x.message)) {
        setNotice("You're already a member. Taking you to your dashboard…")
        setTimeout(() => window.location.assign(DEFAULT_NEXT), 1500)
      } else if (x.status === 409) setNotice(WAITING)
      else if (x.status === 404) setProblem(NOT_FOUND)
      else setFormError(x.message)
    } finally {
      setBusy(false)
    }
  }

  const name = me?.fullName || me?.email || ''
  const memberOf = preview?.isMember && preview.teamId ? preview.teamId : null // QA-41
  const title = problem ? problem.title : memberOf ? 'You’re already in this team' : loading || preview ? 'Join this team' : 'Join a team'
  const logoutUrl = '/logout?next=' + encodeURIComponent('/app/join/' + encodeURIComponent(code))

  return (
    <AuthLayout
      title={title}
      subtitle={problem || memberOf ? undefined : 'You’ll see its spaces and pages once an admin lets you in.'}
      lead={loading ? <TeamSkeleton /> : preview && !problem ? <TeamBlock preview={preview} /> : undefined}
    >
      {problem && (
        <>
          <p className={s.problem} role="alert">{problem.message}</p>
          {problem.home && <Link to="/" className={s.home}>Go to Home</Link>}
        </>
      )}
      {!problem && !loading && (
        <>
          <div className={s.me}>
            <span className={s.avatar} aria-hidden="true" style={tint(name)}>{initialsOf(name)}</span>
            <span className={s.who}><b>{name}</b>{me?.fullName && me.email ? me.email : ''}</span>
            <Link to={logoutUrl} className={s.switch}>Not you?</Link>
          </div>
          {memberOf ? (
            <Link to={`/teams/${memberOf}`} className={s.open}>Open team</Link>
          ) : (
            <>
              <form onSubmit={join} className={s.action}>
                <FormError message={formError} />
                <div role="status">{notice && <div className={s.notice}>{notice}</div>}</div>
                {!notice && <SubmitButton busy={busy} label="Ask to join" busyLabel="Sending…" />}
              </form>
              <p className={s.after}>
                <Icon name="info" />
                <span>An admin approves each request. When they do, the team appears in your sidebar.</span>
              </p>
            </>
          )}
        </>
      )}
    </AuthLayout>
  )
}
