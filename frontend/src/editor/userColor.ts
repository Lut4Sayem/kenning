// One colour per person for cursors and avatars, the same in every tab and for every viewer.
// From the design tokens (cursor-a/b, page colours); each keeps white text at 4.5:1 or more.
export const USER_COLORS = ['#b42d6c', '#1d65a0', '#0f7b6c', '#b05a0a', '#8a5cc4', '#93694f', '#5a4500', '#c4337c'] as const

/** FNV-1a over the user id, so the colour never depends on who joined first. */
export function userColor(userId: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 0x01000193)
  return USER_COLORS[(h >>> 0) % USER_COLORS.length]
}
