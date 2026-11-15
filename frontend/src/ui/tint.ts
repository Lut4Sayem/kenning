const TINTS = ['sky', 'mint', 'peach', 'rose', 'lavender', 'yellow', 'gray'] as const

/** Same name, same tint: a hash of the name picks one of the 7 tint pairs (DESIGN.md section 2). */
export function tintOf(name: string): (typeof TINTS)[number] {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
