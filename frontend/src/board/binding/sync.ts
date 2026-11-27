// Excalidraw <-> Y.Doc, as plain functions. Each element is one plain JSON value in the `elements` map, keyed by id;
// Yjs makes every copy agree on one value per key, and the rules below make that value the newest edit (WB 7.2).
import * as Y from 'yjs'
import { ELEMENTS } from '../format'
import { LOCAL } from './undo'

export { LOCAL }
/** Origin of write-backs: this user's own value going out again, not a new change, so not an undo step. */
export const WRITE_BACK = 'write-back'

export type El = {
  id: string
  type: string
  version: number
  versionNonce: number
  isDeleted: boolean
  index: string | null
  updated: number
  [k: string]: unknown
}

const elements = (doc: Y.Doc) => doc.getMap<El>(ELEMENTS)

/** Excalidraw's rule: the higher version wins; on a tie the lower versionNonce wins. */
export const loses = (a: El, b: El) =>
  a.version < b.version || (a.version === b.version && a.versionNonce > b.versionNonce)

/**
 * Sends every element whose version is above what this client last wrote or saw (`known`, updated here), in one
 * transaction. A freehand stroke still being drawn is held back: it goes out once, when the pen lifts.
 */
export function pushLocal(
  doc: Y.Doc,
  local: readonly El[],
  known: Map<string, number>,
  opts: { editingId: string | null; drawingFreedraw: boolean },
): string[] {
  const out = local.filter(
    (e) =>
      e.version > (known.get(e.id) ?? -1) &&
      !(opts.drawingFreedraw && e.type === 'freedraw' && e.id === opts.editingId),
  )
  if (out.length === 0) return []
  doc.transact(() => {
    for (const e of out) {
      elements(doc).set(e.id, e)
      known.set(e.id, e.version)
    }
  }, LOCAL)
  return out.map((e) => e.id)
}

const byIndex = (a: El, b: El) => {
  if (a.index !== b.index) {
    if (a.index === null) return 1
    if (b.index === null) return -1
    return a.index < b.index ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The scene to show: the map sorted by layer order, except the element this user is editing keeps its local copy. */
export function sceneFromDoc(doc: Y.Doc, local: readonly El[], editingId: string | null): El[] {
  const mine = editingId === null ? undefined : local.find((e) => e.id === editingId)
  return [...elements(doc).values()].map((e) => (mine && e.id === mine.id ? mine : e)).sort(byIndex)
}

/**
 * Write-back rule: when the value Yjs settled on loses to this client's own copy, this client writes its copy back,
 * once. Two people edited the element at the same moment, or the server kept a concurrent write Yjs preferred and
 * silently dropped ours; either way the newest edit wins and every copy converges.
 */
export function writeBackLosers(doc: Y.Doc, local: readonly El[], changedIds: Iterable<string>): string[] {
  const byId = new Map(local.map((e) => [e.id, e]))
  const out: El[] = []
  for (const id of changedIds) {
    const mine = byId.get(id)
    const settled = elements(doc).get(id)
    if (mine && settled && loses(settled, mine)) out.push(mine)
  }
  if (out.length > 0) doc.transact(() => out.forEach((e) => elements(doc).set(e.id, e)), WRITE_BACK)
  return out.map((e) => e.id)
}

/** At most one run per `ms`: the first call runs at once, the latest call in a window runs at its end. */
export function createThrottle(ms = 100): (fn: () => void) => void {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: (() => void) | undefined
  return (fn) => {
    const wait = last + ms - Date.now()
    if (wait <= 0 && timer === undefined) {
      last = Date.now()
      fn()
      return
    }
    pending = fn
    timer ??= setTimeout(() => {
      timer = undefined
      last = Date.now()
      pending?.()
    }, Math.max(wait, 0))
  }
}
