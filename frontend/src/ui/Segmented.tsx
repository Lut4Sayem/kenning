import { type KeyboardEvent } from 'react'
import s from './Segmented.module.css'

export interface SegmentOption<T extends string> { value: T; label: string; count?: number }

/** Pill track with one active segment (DESIGN.md section 6). Arrow keys move between segments. */
/** `idPrefix`: tab ids are `${idPrefix}-tab-<value>` and they control the element with id `${idPrefix}-panel` (role tabpanel). */
/** `onPage`: on the white page (track --surface-card-hover, segments sized to their text); default is the ground-coloured panel. */
export default function Segmented<T extends string>({ label, idPrefix, value, onChange, options, onPage }: {
  label: string
  onPage?: boolean
  idPrefix: string
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
}) {
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]
    onChange(next.value)
    document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus()
  }
  return (
    <div className={`${s.track} ${onPage ? s.onPage : ''}`} role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value} id={`${idPrefix}-tab-${o.value}`} type="button" role="tab" aria-selected={o.value === value} aria-controls={`${idPrefix}-panel`} tabIndex={o.value === value ? 0 : -1}
          className={s.seg} onClick={() => onChange(o.value)} onKeyDown={(e) => move(e, i)}
        >
          {o.label}
          {o.count !== undefined && <span className={s.count}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
