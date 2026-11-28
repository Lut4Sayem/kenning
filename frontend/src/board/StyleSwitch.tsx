import type { StyleMode } from './style'
import s from './Board.module.css'

export default function StyleSwitch({ mode, onChange }: { mode: StyleMode; onChange: (mode: StyleMode) => void }) {
  return (
    <span role="group" aria-label="Style of new shapes" className={s.styles}>
      <button type="button" aria-pressed={mode === 'sketch'} onClick={() => onChange('sketch')}>Sketch</button>
      <button type="button" aria-pressed={mode === 'precise'} onClick={() => onChange('precise')}>Precise</button>
    </span>
  )
}
