import { Link } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import { timeCompact } from '../ui/timeAgo'
import s from './Home.module.css'

export interface PageRowProps {
  id: string
  title: string
  location: string
  /** null: no pill. */
  status: 'DRAFT' | 'PUBLISHED' | null
  /** Who to show (the draft list shows me, the team list the last editor); omit for none. */
  avatar?: { name: string; me?: boolean }
  when: string | null
}

/** The 42px list row shared by "Your drafts" and Recent (DESIGN.md section 6). */
export default function PageRow({ id, title, location, status, avatar, when }: PageRowProps) {
  return (
    <li>
      <Link to={`/p/${id}`} className={s.row}>
        <span className={s.rowDot} aria-hidden="true" />
        <span className={s.rowTitle}>{title || 'Untitled'}</span>
        <span className={s.rowLoc}>{location}</span>
        {status && <span className={`${s.pill} ${status === 'PUBLISHED' ? s.published : ''}`}>{status === 'PUBLISHED' ? 'Published' : 'Draft'}</span>}
        {avatar && <span className={s.rowAvatar}><Avatar name={avatar.name} me={avatar.me} /></span>}
        <time className={s.when} dateTime={when ?? undefined}>{timeCompact(when)}</time>
      </Link>
    </li>
  )
}

export function SkeletonRows({ n }: { n: number }) {
  return <ul className={s.list} aria-hidden="true">{Array.from({ length: n }, (_, i) => <li key={i}><span className={`${s.skel} ${s.skelRow}`} /></li>)}</ul>
}
