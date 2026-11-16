import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Source { n: number; id: string; title: string }

// Bold, italic, inline code and citations ([2], [1, 2], or the full-width 【2】 some models write).
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|`[^`\n]+`|\s?[[【]\s*\d{1,2}(?:\s*,\s*\d{1,2})*\s*[\]】])/

function inline(text: string, sources: Source[]): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part // plain text: React escapes it, so model output can never become HTML
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') || part.startsWith('__')) return <strong key={i}>{inline(part.slice(2, -2), sources)}</strong>
    if (part.startsWith('*') || part.startsWith('_')) return <em key={i}>{inline(part.slice(1, -1), sources)}</em>
    const cited = (part.match(/\d+/g) ?? []).map((n) => sources.find((s) => s.n === Number(n))).filter((s): s is Source => !!s)
    return cited.length ? (
      <Fragment key={i}>{' '}{cited.map((s) => <sup key={s.n}><Link to={`/p/${s.id}`} aria-label={`Source ${s.n}: ${s.title}`}>[{s.n}]</Link></sup>)}</Fragment>
    ) : null // a mark that points at no page we sent is dropped
  })
}

/**
 * The small part of Markdown that AI answers use: paragraphs, "-"/"*"/"1." lists, "#" headings (as bold lines), bold,
 * italic, inline code and [n] citations. Built from React elements only, never innerHTML, so it needs no sanitiser.
 */
export default function Markdown({ text, sources = [], className }: { text: string; sources?: Source[]; className?: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => { if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '), sources)}</p>); para = [] }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, sources)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const item = line.match(/^(?:([-*+])|\d{1,3}[.)])\s+(.*)$/)
    if (item) {
      flushPara()
      const ordered = !item[1]
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(item[2])
    } else if (!line) {
      flushPara(); flushList()
    } else {
      flushList()
      const heading = line.match(/^#{1,6}\s+(.*)$/)
      if (heading) blocks.push(<p key={blocks.length}><strong>{inline(heading[1], sources)}</strong></p>)
      else para.push(line)
    }
  }
  flushPara(); flushList()
  return <div className={className}>{blocks}</div>
}
