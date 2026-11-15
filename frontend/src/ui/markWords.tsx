import type { ReactNode } from 'react'

/** Wraps each word of `q` found in `text` in a <mark> (case-insensitive). React elements only, never HTML. */
export function markWords(text: string, q: string): ReactNode {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return text
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}
