import { diffWords } from 'diff'
import type { VersionAuthor } from '../api/versions'
import { authorTint } from './authorColours'
import s from './History.module.css'

/** Words added in `text` (tint background + underline in the author's colour) and removed from `previousText` (struck through, rose). */
export default function DiffView({ text, previousText, authors }: { text: string; previousText: string; authors: VersionAuthor[] }) {
  const tint = authorTint(authors)
  const parts = diffWords(previousText, text)
  return (
    <div className={s.diff} style={{ '--ins-bg': `var(--tint-${tint}-bg)`, '--ins-line': `var(--tint-${tint}-fg)` } as React.CSSProperties}>
      <p className={s.diffText}>
        {parts.map((p, i) =>
          p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>,
        )}
      </p>
      <p className={s.legend}>
        <span aria-hidden="true" className={s.swatch} />
        {authors.length ? `${authors.map((a) => a.name).join(', ')}'s changes` : 'Changes'}
        <span>Struck-through text was removed</span>
      </p>
    </div>
  )
}
