import type { VersionAuthor } from '../api/versions'

// One tint pair per author (DESIGN.md section 2). Rose is left out: it marks deleted text.
const TINTS = ['mint', 'yellow', 'sky', 'peach', 'lavender'] as const

/** The same person always gets the same colour. A version by several people shares the first colour (the legend lists every name). */
export function authorTint(authors: VersionAuthor[]): (typeof TINTS)[number] {
  if (authors.length !== 1) return TINTS[0]
  return tintForUser(authors[0].id)
}

export function tintForUser(userId: string): (typeof TINTS)[number] {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}
