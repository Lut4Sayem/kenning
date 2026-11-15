import { createRoot } from 'react-dom/client'
import TokenPanel from './TokenPanel'

/** Adds the floating token panel to the page. Does nothing outside development. */
export function mountTokenPanel(enabled: boolean = import.meta.env.DEV): HTMLElement | null {
  if (!enabled) return null
  const el = document.createElement('div')
  el.id = 'kf-dev-tokens'
  document.body.appendChild(el)
  createRoot(el).render(<TokenPanel />)
  return el
}
