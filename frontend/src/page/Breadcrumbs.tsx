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

/**
 * Team / space / parents / this page. The page itself is the only one with a dot and the ink colour.
 * Deep pages collapse the middle ("Team / Space / … / Parent / Page") so the team and space stay in view (QA-42);
 * anything that can be cut short carries its full text as a tooltip.
 */
export default function Breadcrumbs({ team, spaceName, crumbs, current, colour = 'gray' }: Props) {
  const hidden = crumbs.slice(0, -1)
  const shown = crumbs.slice(-1)
  const name = (c: { title: string }) => c.title || 'Untitled'
  return (
    <nav className={s.crumbs} aria-label="Breadcrumb">
      <ol>
        {team && <li><Link to={`/teams/${team.id}`} title={team.name}>{team.name}</Link></li>}
        {spaceName && <li><span title={spaceName}>{spaceName}</span></li>}
        {hidden.length > 0 && <li><span title={hidden.map(name).join(' / ')}>…</span></li>}
        {shown.map((c) => <li key={c.id}><Link to={`/p/${c.id}`} title={name(c)}>{name(c)}</Link></li>)}
        <li aria-current="page">
          <span className={s.current}><span className={s.dot} style={{ background: `var(--page-${colour})` }} aria-hidden="true" /><span title={current || 'Untitled'}>{current || 'Untitled'}</span></span>
        </li>
      </ol>
    </nav>
  )
}
