// Board light/dark theme (WB 7.5): this user's choice, remembered in the browser.
export type BoardTheme = 'light' | 'dark'
const KEY = 'kf.board.theme'

export function loadTheme(): BoardTheme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function saveTheme(theme: BoardTheme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked: the choice just is not remembered
  }
}
