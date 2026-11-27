// Per-user board history (WB 7.2, anti-goal 2). Undo only reverts this user's own changes, skips any element
// someone else changed since, and writes the restored value as a fresh edit with a higher version: collab keeps
// the higher version (sanitizeChanged), so a restored copy with its old version would be put back.
// Y.UndoManager can't do this: its next undo step refuses to go past the re-stamped value (it reads it as a
// later change by another client). Imports only yjs: the collab tests run it against the server rules.
import * as Y from 'yjs'
import { ELEMENTS } from '../format.js'

/** Origin of this browser's own board writes; only these become undo steps. */
export const LOCAL = 'local'

export interface BoardUndo {
  undo(): void
  redo(): void
  /** Ends the current gesture: the next change starts a new undo step. */
  stopCapturing(): void
  canUndo(): boolean
  canRedo(): boolean
  destroy(): void
}

type Value = { version: number; versionNonce: number; isDeleted?: boolean; updated?: number; [k: string]: unknown }
/** `before` null = the gesture created the element. `expect` = the value this entry last wrote (or saw written). */
type Entry = { before: Value | null; after: Value; expect: Value }
type Gesture = Map<string, Entry>

const CAPTURE_MS = 500 // groups quick keyboard nudges; pointer gestures end with stopCapturing()
const STAMP = new Set(['version', 'versionNonce', 'updated'])

/** Same element content, whatever its version stamp (an undo/redo re-stamps what it writes). */
function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a).filter((k) => !STAMP.has(k))
  const kb = Object.keys(b).filter((k) => !STAMP.has(k))
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameContent((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function createUndo(doc: Y.Doc): BoardUndo {
  const map = doc.getMap<Value>(ELEMENTS)
  const undoStack: Gesture[] = []
  const redoStack: Gesture[] = []
  const maxSeen = new Map<string, number>()
  let open = false // the top of undoStack still takes changes
  let lastChange = 0
  let applying = false

  const see = (id: string, v: Value | undefined) => {
    if (v && v.version > (maxSeen.get(id) ?? -1)) maxSeen.set(id, v.version)
  }
  map.forEach((v, id) => see(id, v))

  const observer = (e: Y.YMapEvent<Value>) => {
    e.keysChanged.forEach((id) => see(id, map.get(id)))
    if (e.transaction.origin !== LOCAL || applying) return
    const now = Date.now()
    if (!open || now - lastChange >= CAPTURE_MS) undoStack.push(new Map())
    open = true
    lastChange = now
    redoStack.length = 0
    const gesture = undoStack[undoStack.length - 1]
    e.changes.keys.forEach((c, id) => {
      const after = map.get(id)
      if (!after) return
      const was = gesture.get(id)
      gesture.set(id, { before: was ? was.before : ((c.oldValue as Value | undefined) ?? null), after, expect: after })
    })
  }
  map.observe(observer)

  const stamp = (id: string, v: Value): Value => ({
    ...v,
    version: Math.max(maxSeen.get(id) ?? 0, v.version) + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    updated: Date.now(),
  })

  /** Writes each entry's target where the element still holds what this user left there; returns what it wrote. */
  function apply(from: Gesture[], to: Gesture[], target: (e: Entry) => Value) {
    open = false
    while (from.length > 0) {
      const gesture = from.pop()!
      const done: Gesture = new Map()
      applying = true
      try {
        doc.transact(() => {
          gesture.forEach((entry, id) => {
            if (!sameContent(map.get(id), entry.expect)) return // someone changed it since: their work wins
            const written = stamp(id, target(entry))
            map.set(id, written)
            done.set(id, { ...entry, expect: written })
          })
        }, LOCAL)
      } finally {
        applying = false
      }
      if (done.size > 0) {
        to.push(done)
        return
      }
    }
  }

  return {
    undo: () => apply(undoStack, redoStack, (e) => e.before ?? { ...e.after, isDeleted: true }),
    redo: () => apply(redoStack, undoStack, (e) => e.after),
    stopCapturing: () => {
      open = false
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    destroy: () => map.unobserve(observer),
  }
}
