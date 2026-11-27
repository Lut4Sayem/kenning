// Keeps a loaded board valid: fixes what was stored, then checks every change a client makes (7.3).
import * as Y from 'yjs'
import { log } from '../log.js'
import { ELEMENTS } from './format.js'
import { SERVER, fixIndexClashes, sanitizeChanged, slimTombstones } from './sanitize.js'

/** Call after the stored state is applied. The observer goes away with the doc (Hocuspocus destroys it on unload). */
export function guardBoard(doc: Y.Doc, nodeId: string) {
  slimTombstones(doc, Date.now())
  fixIndexClashes(doc)
  doc.getMap(ELEMENTS).observe((event) => {
    const origin = event.transaction.origin
    // our own fixes and Spring's merges are trusted; re-checking them would only loop
    if (origin === SERVER || origin === 'spring') return
    const changed = new Map<string, unknown>()
    event.changes.keys.forEach((c, key) => changed.set(key, c.oldValue))
    // a client update's origin is Hocuspocus's { source: 'connection', connection }
    const userId = (origin as { connection?: { context?: { userId?: string } } } | null)?.connection?.context?.userId ?? null
    for (const { id, reason } of sanitizeChanged(doc, changed)) log('board-sanitized', { nodeId, userId, id, reason })
    fixIndexClashes(doc)
  })
}
