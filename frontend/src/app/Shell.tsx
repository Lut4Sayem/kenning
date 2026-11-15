import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet } from 'react-router-dom'
import CommandPalette from '../palette/CommandPalette'
import Sidebar from '../tree/Sidebar'
import s from './Shell.module.css'
import { SlotsContext } from './ShellSlots'

export default function Shell() {
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [topbar, setTopbar] = useState<HTMLElement | null>(null)
  const [details, setDetails] = useState<HTMLElement | null>(null)
  const from = useRef<HTMLElement | null>(null) // what had focus before the palette: gets it back on close

  const show = useCallback(() => {
    from.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    flushSync(() => setOpen(true)) // committed before the next key event, so fast typing lands in the input
  }, [])
  const hide = useCallback(() => setOpen(false), [])

  // After the commit: the modal dialog is gone by now, so the trigger is no longer inert and can take focus.
  useEffect(() => {
    if (!open && from.current?.isConnected) from.current.focus()
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) hide()
        else show()
      }
    }
    window.addEventListener('keydown', onKey, true) // capture: wins over the editor's own Ctrl+K
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, show, hide])

  return (
    <SlotsContext.Provider value={{ topbar, details, detailsOpen, setDetailsOpen }}>
      <div className={s.shell}>
        <a href="#main" className={s.skip}>Skip to content</a>
        <div className={s.sidebarCol}><Sidebar onSearch={show} /></div>
        <div className={s.panel}>
          <header ref={setTopbar} className={s.topbar} />
          <main id="main" tabIndex={-1} className={s.main}>
            <Outlet />
          </main>
        </div>
        {detailsOpen && <aside ref={setDetails} className={s.details} aria-label="Details" />}
        <CommandPalette open={open} onClose={hide} />
      </div>
    </SlotsContext.Provider>
  )
}
