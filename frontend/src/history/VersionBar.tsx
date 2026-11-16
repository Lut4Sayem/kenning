import Icon from '../ui/Icon'
import type { Viewing } from './HistoryPanel'
import s from './History.module.css'

const when = (iso: string) => {
  const d = new Date(iso)
  const day = d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `${day} ${d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
}

// QA-22: the list shows no numbers, so the bar names a version by its kind (or name) and time, like the list does.
function what(v: Viewing['version']): string {
  switch (v.kind) {
    case 'NAMED': return v.name ? `“${v.name}”` : 'the named version'
    case 'PUBLISHED': return 'the published version'
    case 'RESTORED': return 'the restored version'
    case 'RECOVERED': return 'the recovered changes'
    default: return 'the autosave'
  }
}

/** The bar under the top bar while a version is on screen (DESIGN.md section 7). */
export default function VersionBar({ viewing, onBack }: { viewing: Viewing; onBack: () => void }) {
  const { version: v, number, previousNumber, against } = viewing
  const by = v.authors.map((a) => a.name).join(', ')
  const name = <><strong>{number ? what(v) : 'the published version'}</strong> from {when(v.createdAt)}{by && <> by {by}</>}</>
  return (
    <div className={s.bar} role="status">
      <Icon name="history" />
      <span className={s.barText}>
        {against === 'current' ? (
          <>Comparing {name} with the current page. Highlights show what changed since.</>
        ) : (
          <>
            Viewing {name}.{' '}
            {previousNumber ? 'Highlights show what changed since the version before it.' : 'This is the first version: everything is new.'}
          </>
        )}
      </span>
      <button type="button" className={s.back} onClick={onBack}>Back to current</button>
    </div>
  )
}
