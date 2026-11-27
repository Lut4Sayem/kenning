// Server-side board fixes. Collab is the one trusted writer: it removes bad elements, keeps stale copies
// from winning, slims old tombstones and settles layer-order clashes. Bindings are never touched (7.3).
import * as Y from 'yjs'
import { generateKeyBetween } from 'fractional-indexing'
import { ALLOWED_TYPES, ELEMENTS, LIMITS, TOMBSTONE_KEEP } from './format.js'

export const SERVER = 'server'
const TOMBSTONE_AGE_MS = 24 * 3_600_000

type El = Record<string, unknown>

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v))
const tooLong = (s: unknown) => typeof s === 'string' && s.length > LIMITS.textChars

function invalidReason(key: string, v: unknown): string | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'malformed'
  const e = v as El
  if (typeof e.id !== 'string' || typeof e.type !== 'string' || e.id !== key) return 'malformed'
  if (!Number.isFinite(e.version) || !Number.isFinite(e.versionNonce)) return 'malformed'
  if (!ALLOWED_TYPES.has(e.type)) return 'type'
  if (e.type === 'freedraw' && Array.isArray(e.points) && e.points.length > LIMITS.points) return 'points'
  if (e.type === 'text' && (tooLong(e.text) || tooLong(e.originalText))) return 'text'
  if (e.customData !== undefined && bytes(e.customData) > LIMITS.customDataBytes) return 'customData'
  if (bytes(e) > LIMITS.elementBytes) return 'size'
  return null
}

// Excalidraw's rule: higher version wins; on a tie the lower versionNonce wins.
function loses(next: El, prev: El): boolean {
  const [nv, pv] = [next.version as number, prev.version as number]
  return nv < pv || (nv === pv && (next.versionNonce as number) > (prev.versionNonce as number))
}

/**
 * `changed` maps each changed key to its oldValue from the Y.Map event. Keys are never deleted legitimately
 * (deletes are tombstones), so a removed or invalid value falls back to the previous valid one; dropping the
 * key would let an old offline copy re-add a deleted element (7.1).
 */
export function sanitizeChanged(doc: Y.Doc, changed: Map<string, unknown>): { id: string; reason: string }[] {
  const map = doc.getMap<unknown>(ELEMENTS)
  const done: { id: string; reason: string }[] = []
  const writes: [string, unknown][] = [] // undefined value = delete the key
  for (const [id, oldValue] of changed) {
    const previous = oldValue !== undefined && invalidReason(id, oldValue) === null ? oldValue : undefined
    const value = map.get(id)
    const reason = !map.has(id) ? (previous === undefined ? null : 'deleted') : invalidReason(id, value)
    if (reason) {
      writes.push([id, previous])
      done.push({ id, reason })
    } else if (previous !== undefined && loses(value as El, previous as El)) {
      // An old offline copy can win Yjs's tie-break; put the newer value back.
      writes.push([id, previous])
      done.push({ id, reason: 'stale' })
    }
  }
  if (writes.length > 0) {
    doc.transact(() => {
      for (const [id, v] of writes) {
        if (v === undefined) map.delete(id)
        else map.set(id, v)
      }
    }, SERVER)
  }
  return done
}

export function slimTombstones(doc: Y.Doc, now: number): number {
  const map = doc.getMap<unknown>(ELEMENTS)
  const stubs: [string, El][] = []
  for (const [id, v] of map) {
    const e = v as El
    if (invalidReason(id, v) !== null || e.isDeleted !== true || typeof e.updated !== 'number') continue
    if (now - e.updated <= TOMBSTONE_AGE_MS || Object.keys(e).every((k) => TOMBSTONE_KEEP.includes(k))) continue
    stubs.push([id, Object.fromEntries(TOMBSTONE_KEEP.filter((k) => k in e).map((k) => [k, e[k]]))])
  }
  if (stubs.length > 0) doc.transact(() => stubs.forEach(([id, stub]) => map.set(id, stub)), SERVER)
  return stubs.length
}

function validKey(index: unknown): index is string {
  if (typeof index !== 'string') return false
  try {
    generateKeyBetween(index, null)
    return true
  } catch {
    return false
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Gives each live element whose index clashes with an earlier one (or is null/invalid) a fresh key. */
export function fixIndexClashes(doc: Y.Doc): number {
  const map = doc.getMap<unknown>(ELEMENTS)
  const live = [...map].filter(([id, v]) => invalidReason(id, v) === null && !(v as El).isDeleted).map(([, v]) => v as El)
  const sorted = live.filter((e) => validKey(e.index)).sort((a, b) => cmp(a.index as string, b.index as string) || cmp(a.id as string, b.id as string))
  const bad = live.filter((e) => !validKey(e.index)).sort((a, b) => cmp(a.id as string, b.id as string))
  const fixes: [El, string][] = []
  let prev: string | null = null
  for (let i = 0; i < sorted.length; i++) {
    const index = sorted[i].index as string
    if (prev === null || index > prev) {
      prev = index
      continue
    }
    const next = sorted.slice(i + 1).find((e) => (e.index as string) > prev!)?.index as string | undefined
    prev = generateKeyBetween(prev, next ?? null)
    fixes.push([sorted[i], prev])
  }
  for (const e of bad) {
    prev = generateKeyBetween(prev, null)
    fixes.push([e, prev])
  }
  if (fixes.length === 0) return 0
  doc.transact(() => {
    for (const [e, index] of fixes) {
      const version = (e.version as number) + 1
      map.set(e.id as string, { ...e, index, version, versionNonce: Math.floor(Math.random() * 2 ** 31) })
    }
  }, SERVER)
  return fixes.length
}
