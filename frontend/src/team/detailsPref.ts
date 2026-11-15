const key = (screen: string) => `kf.details.${screen}`

/** A screen's details panel is open by default; the choice is remembered per screen. */
export function readPref(screen = 'team-overview'): boolean {
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
