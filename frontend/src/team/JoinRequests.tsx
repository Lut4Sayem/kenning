import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { answerJoinRequest, type JoinRequest } from '../api/teams'
import Avatar from '../ui/Avatar'
import { timeAgo } from '../ui/timeAgo'
import { toast } from '../ui/Toast'
import type { TeamContext } from './TeamLayout'
import s from './Members.module.css'

type Role = 'VIEWER' | 'EDITOR'

/** The yellow "Join requests" box: Decline (with Undo) and Accept as the chosen role, off while the server answers. */
export default function JoinRequests({ full }: { full?: boolean }) {
  const { teamId, requests, requestsLoaded, refetchRequests } = useOutletContext<TeamContext>()
  const qc = useQueryClient()
  const [answering, setAnswering] = useState('')
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<Record<string, Role>>({})

  async function answer(r: JoinRequest, accept: boolean) {
    if (answering) return
    setAnswering(r.id)
    setError('')
    try {
      await (accept ? answerJoinRequest(teamId, r.id, 'accept', roles[r.id] ?? 'VIEWER') : answerJoinRequest(teamId, r.id, 'reject'))
      await Promise.all([refetchRequests(), ...['team', 'team-summary', 'teams'].map((k) => qc.invalidateQueries({ queryKey: [k] }))])
      if (!accept) toast(`Declined ${r.fullName}`, 'info', { action: { label: 'Undo', run: () => void undo(r) }, ms: 8000 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer the request')
    }
    setAnswering('')
  }

  // Decline happens at once and can be undone for 8 s, instead of a confirm first (QA-06).
  async function undo(r: JoinRequest) {
    try {
      await answerJoinRequest(teamId, r.id, 'reopen')
      await refetchRequests()
    } catch (e) {
      toast(`Could not undo: ${e instanceof Error ? e.message : 'try again'}`, 'error')
    }
  }

  return (
    <section className={`${s.requests} ${full ? s.full : ''}`} aria-labelledby="req-h">
      <div className={s.boxHead}>
        <h2 id="req-h" className={s.boxTitle}>Join requests</h2>
        {requestsLoaded && <span className={s.count}>{requests.length}</span>}
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      {!requestsLoaded ? <span className={`${s.skelBar}`} aria-hidden="true" />
        : requests.length === 0 ? <p className={s.note}>No one is waiting to join.</p>
        : (
          <ul className={s.reqList}>
            {requests.map((r) => (
              <li key={r.id} className={s.req}>
                <Avatar name={r.fullName} size={28} />
                <span className={s.who}>
                  <span className={s.name}>{r.fullName}</span>
                  <span className={s.email}>asked {timeAgo(r.requestedAt)}</span>
                </span>
                <span className={s.reqActions}>
                  <button type="button" className={s.decline} disabled={answering === r.id} aria-label={`Decline ${r.fullName}`} onClick={() => void answer(r, false)}>Decline</button>
                  <select className={s.joinRole} aria-label={`Role for ${r.fullName}`} disabled={answering === r.id}
                    value={roles[r.id] ?? 'VIEWER'} onChange={(e) => setRoles({ ...roles, [r.id]: e.target.value as Role })}>
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                  <button type="button" className={s.accept} disabled={answering === r.id} aria-label={`Accept ${r.fullName}`} onClick={() => void answer(r, true)}>Accept</button>
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
