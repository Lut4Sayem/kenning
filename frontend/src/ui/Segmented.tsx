import { useId, type KeyboardEvent } from 'react'
import s from './Segmented.module.css'

export interface SegmentOption<T extends string> { value: T; label: string; count?: number }

/** Pill track with one active segment (DESIGN.md section 6). Arrow keys move between segments. */
export default function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
}) {
  const id = useId()
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]
    onChange(next.value)
    document.getElementById(`${id}-${next.value}`)?.focus()
  }
  return (
    <div className={s.track} role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value} id={`${id}-${o.value}`} type="button" role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={s.seg} onClick={() => onChange(o.value)} onKeyDown={(e) => move(e, i)}
        >
          {o.label}
          {o.count !== undefined && <span className={s.count}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
