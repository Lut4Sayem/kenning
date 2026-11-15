import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { answerJoinRequest } from '../api/teams'
import Avatar from '../ui/Avatar'
import { timeAgo } from '../ui/timeAgo'
import type { TeamContext } from './TeamLayout'
import s from './Members.module.css'

/** The yellow "Join requests" box: Decline and Accept per request, off while the server answers. */
export default function JoinRequests({ full }: { full?: boolean }) {
  const { teamId, requests, requestsLoaded, refetchRequests } = useOutletContext<TeamContext>()
  const qc = useQueryClient()
  const [answering, setAnswering] = useState('')
  const [error, setError] = useState('')

  async function answer(id: string, accept: boolean) {
    if (answering) return
    setAnswering(id)
    setError('')
    try {
      await answerJoinRequest(teamId, id, accept)
      await Promise.all([refetchRequests(), ...['team', 'team-summary', 'teams'].map((k) => qc.invalidateQueries({ queryKey: [k] }))])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer the request')
    }
    setAnswering('')
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
                <button type="button" className={s.decline} disabled={answering === r.id} aria-label={`Decline ${r.fullName}`} onClick={() => void answer(r.id, false)}>Decline</button>
                <button type="button" className={s.accept} disabled={answering === r.id} aria-label={`Accept ${r.fullName}`} onClick={() => void answer(r.id, true)}>Accept</button>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
