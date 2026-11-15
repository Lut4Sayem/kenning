const key = (screen: string) => `kf.details.${screen}`

/** A screen's details panel is open by default; the choice is remembered per screen. Below 1024px it floats over the page, so it starts closed. */
export function readPref(screen = 'team-overview'): boolean {
  if (window.matchMedia?.('(max-width: 1023.98px)').matches) return false
  try {
    return localStorage.getItem(key(screen)) !== '0'
  } catch {
    return true
  }
}

export function savePref(open: boolean, screen = 'team-overview') {
  try {
    localStorage.setItem(key(screen), open ? '1' : '0')
  } catch {
    // ignore: the choice just is not remembered
  }
}
