// Keeps a loaded board valid: fixes what was stored, then checks every change a client makes (7.3).
import * as Y from 'yjs'
import { log } from '../log.js'
import { ELEMENTS, META } from './format.js'
import { SERVER, fixIndexClashes, sanitizeChanged, slimTombstones } from './sanitize.js'

type El = { index?: unknown; isDeleted?: unknown } | null | undefined

// our own fixes and Spring's merges are trusted; re-checking them would only loop
const trusted = (origin: unknown) => origin === SERVER || origin === 'spring'

/** `meta` holds exactly {formatVersion: 1} (7.1). */
function fixMeta(doc: Y.Doc) {
  const meta = doc.getMap<unknown>(META)
  const extra = [...meta.keys()].filter((k) => k !== 'formatVersion')
  if (extra.length === 0 && meta.get('formatVersion') === 1) return
  doc.transact(() => {
    extra.forEach((k) => meta.delete(k))
    if (meta.get('formatVersion') !== 1) meta.set('formatVersion', 1)
  }, SERVER)
}

/** Call after the stored state is applied. The observers go away with the doc (Hocuspocus destroys it on unload). */
export function guardBoard(doc: Y.Doc, nodeId: string) {
  const map = doc.getMap<unknown>(ELEMENTS)
  // every stored key once, with nothing to restore: a board stored with bad data heals
  const all = new Map<string, unknown>([...map.keys()].map((k) => [k, undefined]))
  for (const { id, reason } of sanitizeChanged(doc, all)) log('board-sanitized', { nodeId, userId: null, id, reason })
  fixMeta(doc)
  slimTombstones(doc, Date.now())
  fixIndexClashes(doc)
  map.observe((event) => {
    const origin = event.transaction.origin
    if (trusted(origin)) return
    // a throw here would reach Hocuspocus's update handling; log the node only (no content)
    try {
      const changed = new Map<string, unknown>()
      event.changes.keys.forEach((c, key) => changed.set(key, c.oldValue))
      // a client update's origin is Hocuspocus's { source: 'connection', connection }
      const userId = (origin as { connection?: { context?: { userId?: string } } } | null)?.connection?.context?.userId ?? null
      for (const { id, reason } of sanitizeChanged(doc, changed)) log('board-sanitized', { nodeId, userId, id, reason })
      // layer order can only clash when an element is added, re-indexed or brought back from deleted
      const moved = [...changed].some(([k, old]) => {
        const [o, v] = [old as El, map.get(k) as El]
        return old === undefined || o?.index !== v?.index || o?.isDeleted !== v?.isDeleted
      })
      if (moved) fixIndexClashes(doc)
    } catch {
      log('board-sanitize-error', { nodeId })
    }
  })
  doc.getMap(META).observe((event) => {
    if (trusted(event.transaction.origin)) return
    try {
      fixMeta(doc)
    } catch {
      log('board-sanitize-error', { nodeId })
    }
  })
}
