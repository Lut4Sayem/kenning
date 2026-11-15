import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ShellSlots {
  topbar: HTMLElement | null
  details: HTMLElement | null
  detailsOpen: boolean
  setDetailsOpen: (open: boolean) => void
}

export const SlotsContext = createContext<ShellSlots>({ topbar: null, details: null, detailsOpen: false, setDetailsOpen: () => {} })

export const useShellSlots = () => useContext(SlotsContext)

/** A route fills the 56px bar: breadcrumbs on the left, actions on the right. */
export function TopBar({ children }: { children: ReactNode }) {
  const { topbar } = useShellSlots()
  return topbar ? createPortal(children, topbar) : null
}

/** A route fills the right details panel (288px, closed by default). Render it only while the panel is open. */
export function DetailsPanel({ children }: { children: ReactNode }) {
  const { details } = useShellSlots()
  return details ? createPortal(children, details) : null
}
