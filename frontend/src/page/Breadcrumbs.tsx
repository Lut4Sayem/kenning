import { Link } from 'react-router-dom'
import s from './Page.module.css'

interface Props {
  team?: { id: string; name: string } | null
  spaceName?: string
  crumbs: { id: string; title: string }[]
  current: string
  /** Page colour (a --page-* token name); gray until the colour field exists. */
  colour?: string
}

/** Team / space / parents / this page. The page itself is the only one with a dot and the ink colour. */
export default function Breadcrumbs({ team, spaceName, crumbs, current, colour = 'gray' }: Props) {
  return (
    <nav className={s.crumbs} aria-label="Breadcrumb">
      <ol>
        {team && <li><Link to={`/teams/${team.id}`}>{team.name}</Link></li>}
        {spaceName && <li><span>{spaceName}</span></li>}
        {crumbs.map((c) => <li key={c.id}><Link to={`/p/${c.id}`}>{c.title || 'Untitled'}</Link></li>)}
        <li aria-current="page">
          <span className={s.current}><span className={s.dot} style={{ background: `var(--page-${colour})` }} aria-hidden="true" /><span>{current || 'Untitled'}</span></span>
        </li>
      </ol>
    </nav>
  )
}
