import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useLocation } from 'react-router-dom'
import CommandPalette from '../palette/CommandPalette'
import Sidebar from '../tree/Sidebar'
import Icon from '../ui/Icon'
import { useRemembered } from '../ui/useRemembered'
import s from './Shell.module.css'
import { SlotsContext } from './ShellSlots'

const PHONE = '(max-width: 639.98px)'
const NARROW = '(max-width: 1023.98px)'

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(query)
    if (!m) return
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

export default function Shell() {
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [topbar, setTopbar] = useState<HTMLElement | null>(null)
  const [details, setDetails] = useState<HTMLElement | null>(null)
  const from = useRef<HTMLElement | null>(null) // what had focus before the palette: gets it back on close

  // Under 640px the sidebar is a drawer; from 640 to 1023 it can be folded away (remembered).
  const phone = useMedia(PHONE)
  const narrow = useMedia(NARROW)
  const [drawer, setDrawer] = useState(false)
  const [shown, toggleShown] = useRemembered('kf.sidebar.shown', true)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const sheet = phone && detailsOpen

  const refocus = useRef(false)
  const closeDrawer = useCallback(() => {
    refocus.current = true // after the commit: until then the button is still inert
    setDrawer(false)
  }, [])
  useEffect(() => setDrawer(false), [pathname, phone]) // a tap on a row leaves the drawer; growing the window drops it
  useEffect(() => {
    if (drawer) drawerRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
  }, [drawer])
  // What sits under the drawer or the sheet can't be reached. React 18 has no boolean `inert` prop.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (drawer || sheet) panel.setAttribute('inert', '')
    else panel.removeAttribute('inert')
    if (!drawer && refocus.current) {
      refocus.current = false
      menuBtn.current?.focus()
    }
  }, [drawer, sheet])
  useEffect(() => {
    if (sheet) details?.querySelector<HTMLElement>('button, a[href]')?.focus()
  }, [sheet, details])

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

  const sidebarVisible = phone ? drawer : !narrow || shown
  const onMenu = () => (phone ? setDrawer(true) : toggleShown())

  return (
    <SlotsContext.Provider value={{ topbar, details, detailsOpen, setDetailsOpen }}>
      <div className={s.shell} data-sidebar={phone ? (drawer ? 'drawer' : 'hidden') : sidebarVisible ? 'shown' : 'hidden'}>
        <a href="#main" className={s.skip}>Skip to content</a>
        {phone && drawer && <div className={s.scrim} onClick={closeDrawer} aria-hidden="true" />}
        <div
          ref={drawerRef} className={s.sidebarCol} id="kf-sidebar"
          {...(phone && drawer ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Navigation' } : {})}
          onKeyDown={phone && drawer ? (e) => { if (e.key === 'Escape') closeDrawer() } : undefined}
        >
          {phone && drawer && (
            <button type="button" className={s.drawerClose} aria-label="Close navigation" onClick={closeDrawer}><Icon name="close" /></button>
          )}
          <Sidebar onSearch={() => { if (phone) setDrawer(false); show() }} />
        </div>
        <div ref={panelRef} className={s.panel}>
          <header className={s.topbar}>
            {narrow && (
              <button
                ref={menuBtn} type="button" className={s.menuBtn} onClick={onMenu}
                aria-label={phone ? 'Open navigation' : sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
                aria-controls="kf-sidebar" aria-expanded={sidebarVisible}
              >
                <Icon name="menu" />
              </button>
            )}
            <div ref={setTopbar} className={s.slot} />
          </header>
          <main id="main" tabIndex={-1} className={s.main}>
            <Outlet />
          </main>
        </div>
        {detailsOpen && <aside ref={setDetails} className={s.details} aria-label="Details" {...(sheet ? { role: 'dialog', 'aria-modal': true } : {})} />}
        <CommandPalette open={open} onClose={hide} />
      </div>
    </SlotsContext.Provider>
  )
}
