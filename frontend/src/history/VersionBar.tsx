import Icon from '../ui/Icon'
import type { Viewing } from './HistoryPanel'
import s from './History.module.css'

const when = (iso: string) => {
  const d = new Date(iso)
  const day = d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `${day} ${d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
}

/** The bar under the top bar while a version is on screen (DESIGN.md section 7). */
export default function VersionBar({ viewing, onBack }: { viewing: Viewing; onBack: () => void }) {
  const { version: v, number, previousNumber, against } = viewing
  const by = v.authors.map((a) => a.name).join(', ')
  return (
    <div className={s.bar} role="status">
      <Icon name="history" />
      <span className={s.barText}>
        {against === 'current' ? (
          <>Comparing <strong>{number ? `Version ${number}` : 'the published version'}</strong>{by && <> by {by}, {when(v.createdAt)}</>}, with the current page. Highlights show what changed since.</>
        ) : (
          <>
            Viewing <strong>Version {number}</strong>{by && <> by {by}</>}, {when(v.createdAt)}.{' '}
            {previousNumber ? `Highlights show what changed since version ${previousNumber}.` : 'This is the first version: everything is new.'}
          </>
        )}
      </span>
      <button type="button" className={s.back} onClick={onBack}>Back to current</button>
    </div>
  )
}
