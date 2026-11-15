import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import s from './Popover.module.css'

/**
 * A button that opens a small panel under it. Closes on Esc (focus goes back to the button) and on a click outside.
 * `trigger` gets the button's props; `children` is the panel content.
 */
export default function Popover({ trigger, label, align = 'right', children }: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'true'; 'aria-controls': string }) => ReactNode
  label: string
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className={s.root} ref={root}>
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': 'true', 'aria-controls': id })}
      {open && <div id={id} role="group" aria-label={label} className={`${s.panel} ${align === 'left' ? s.left : ''}`}>{children}</div>}
    </div>
  )
}
