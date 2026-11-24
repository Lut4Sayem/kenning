import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import s from './Popover.module.css'
import { menuItems, moveMenuFocus } from './menuFocus'

/**
 * A button that opens a small panel under it. Closes on Esc (focus goes back to the button) and on a click outside.
 * `trigger` gets the button's props; `children` is the panel content. With `menu`, the panel is a menu: its menuitem*
 * children get focus on open (the checked one first) and arrow keys move between them.
 */
export default function Popover({ trigger, label, align = 'right', menu = false, children }: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'true' | 'menu'; 'aria-controls': string }) => ReactNode
  label: string
  align?: 'left' | 'right'
  menu?: boolean
  /** The panel content; a function gets `close` (for menus that close when an item is picked). */
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const items = menuItems(root.current)
    ;(items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0])?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
      } else if (moveMenuFocus(e.key, root.current)) e.preventDefault()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className={s.root} ref={root}>
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': menu ? 'menu' : 'true', 'aria-controls': id })}
      {open && <div id={id} role={menu ? 'menu' : 'group'} aria-label={label} className={`${s.panel} ${align === 'left' ? s.left : ''}`}>{typeof children === 'function' ? children(() => { setOpen(false); root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus() }) : children}</div>}
    </div>
  )
}
