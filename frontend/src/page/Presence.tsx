import { useEffect, useState } from 'react'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import s from './Presence.module.css'

export interface Person {
  userId: string
  name: string
  color: string
  /** Every tab this person has open here is view-only. */
  viewer: boolean
}

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>
  on(event: 'change', cb: () => void): void
  off(event: 'change', cb: () => void): void
}

/** Others on this page, one entry per person however many tabs they have open. */
export function people(states: Map<number, Record<string, unknown>>, selfId: string): Person[] {
  const byUser = new Map<string, Person>()
  for (const state of states.values()) {
    const kf = state.kf as { userId?: string; viewer?: boolean } | undefined
    const user = state.user as { name?: string; color?: string } | undefined
    if (!kf?.userId || kf.userId === selfId || !user?.name) continue
    const prev = byUser.get(kf.userId)
    byUser.set(kf.userId, { userId: kf.userId, name: user.name, color: user.color ?? '', viewer: (prev?.viewer ?? true) && !!kf.viewer })
  }
  return [...byUser.values()]
}

const MAX = 4

/** Avatar stack of who else is on the page; viewers carry an eye. */
export default function Presence({ awareness, selfId }: { awareness: AwarenessLike; selfId: string }) {
  const [list, setList] = useState(() => people(awareness.getStates(), selfId))
  useEffect(() => {
    const update = () => setList(people(awareness.getStates(), selfId))
    update()
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [awareness, selfId])

  if (!list.length) return null
  const names = list.map((p) => (p.viewer ? `${p.name} (viewing)` : p.name)).join(', ')
  const more = list.length - MAX
  return (
    <span className={s.stack} role="img" aria-label={`Also on this page: ${names}`} title={names}>
      {list.slice(0, MAX).map((p) => (
        <span key={p.userId} className={s.person} data-person="" data-viewer={p.viewer || undefined}>
          <Avatar name={p.name} color={p.color} className={s.ring} />
          {p.viewer && <span className={s.eye}><Icon name="eye" size={10} /></span>}
        </span>
      ))}
      {more > 0 && <span className={s.more}>+{more}</span>}
    </span>
  )
}
