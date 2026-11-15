const KEY = 'kf.details.team-overview'

/** The team overview's details panel is open by default; the choice is remembered for this screen. */
export function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function savePref(open: boolean) {
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // ignore: the choice just is not remembered
  }
}
