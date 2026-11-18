import { createRoot } from 'react-dom/client'
import TokenPanel from './TokenPanel'

/** Adds the floating token panel to the page. Does nothing outside development. */
export function mountTokenPanel(enabled: boolean = import.meta.env.DEV): HTMLElement | null {
  if (!enabled) return null
  // Local redesign lab (uncommitted folder): glob finds nothing when it is absent, so this stays safe to keep.
  const lab = Object.values(import.meta.glob<{ mountRedesign: () => void }>('./redesign/mount.tsx'))[0]
  if (lab && location.pathname.startsWith('/app/dev/redesign')) {
    void lab().then((m) => m.mountRedesign())
    return null
  }
  const el = document.createElement('div')
  el.id = 'kf-dev-tokens'
  document.body.appendChild(el)
  createRoot(el).render(<TokenPanel />)
  return el
}
