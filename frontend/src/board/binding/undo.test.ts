import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS } from '../format'
import { bindUndoKeys, undoKeyAction } from './keys'
import type { El } from './sync'
import { LOCAL, createUndo, type BoardUndo } from './undo'

const el = (id: string, version: number, versionNonce: number, extra: Partial<El> = {}): El => ({
  id,
  type: 'rectangle',
  version,
  versionNonce,
  isDeleted: false,
  index: 'a0',
  updated: 1,
  x: 0,
  ...extra,
})
const map = (doc: Y.Doc) => doc.getMap<El>(ELEMENTS)
const put = (doc: Y.Doc, ...els: El[]) => doc.transact(() => els.forEach((e) => map(doc).set(e.id, e)), LOCAL)

/** Two live-synced docs; A has a BoardUndo. */
function pair() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.clientID = 1
  b.clientID = 2
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(b, u, 'remote'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(a, u, 'remote'))
  return { a, b, undo: createUndo(a) }
}

describe('createUndo', () => {
  it('undoOnlyOwnChanges', () => {
    const { a, b, undo } = pair()
    put(a, el('x', 1, 1))
    undo.stopCapturing()
    put(b, el('y', 1, 1))
    undo.undo()
    expect(map(a).get('y')).toEqual(el('y', 1, 1))
    expect(map(a).get('x')?.isDeleted).toBe(true)
    expect(map(b).get('x')?.isDeleted).toBe(true)
  })

  it('undoSkipsElementChangedByOthers', () => {
    const { a, b, undo } = pair()
    put(b, el('x', 1, 1), el('z', 1, 1))
    put(a, el('x', 2, 2, { x: 10 }), el('z', 2, 2, { x: 10 }))
    undo.stopCapturing()
    put(b, el('x', 3, 3, { x: 30 }))
    undo.undo()
    expect(map(a).get('x')).toEqual(el('x', 3, 3, { x: 30 }))
    expect(map(a).get('z')?.x).toBe(0)
    expect(map(b).get('z')?.x).toBe(0)
  })

  it('remoteNeverEntersUndo', () => {
    const { b, undo } = pair()
    put(b, el('x', 1, 1))
    put(b, el('x', 2, 2, { x: 5 }))
    expect(undo.canUndo()).toBe(false)
  })

  it('undoRestampsVersion', () => {
    const { a, b, undo } = pair()
    put(b, el('x', 6, 11, { x: 0 }))
    put(a, el('x', 7, 22, { x: 70 }))
    undo.undo()
    const undone = map(a).get('x')!
    expect(undone.x).toBe(0)
    expect(undone.version).toBe(8)
    expect([11, 22]).not.toContain(undone.versionNonce)
    expect(map(b).get('x')).toEqual(undone)
    undo.redo()
    const redone = map(a).get('x')!
    expect(redone.x).toBe(70)
    expect(redone.version).toBe(9)
  })

  it('redoAfterRestampWorks', () => {
    const { a, b, undo } = pair()
    put(b, el('x', 1, 1, { x: 0 }))
    put(a, el('x', 2, 2, { x: 50 }))
    undo.undo()
    expect(undo.canRedo()).toBe(true)
    undo.redo()
    expect(map(a).get('x')?.x).toBe(50)
    undo.undo()
    expect(map(a).get('x')?.x).toBe(0)
    expect(undo.canUndo()).toBe(false) // each press was exactly one step
    expect(map(b).get('x')).toEqual(map(a).get('x'))
  })

  describe('gestures', () => {
    afterEach(() => vi.useRealTimers())

    it('oneDragIsOneUndoStep', () => {
      vi.useFakeTimers()
      const { a, b, undo } = pair()
      put(b, el('x', 1, 1, { x: 0 }))
      for (let i = 1; i <= 20; i++) {
        put(a, el('x', 1 + i, i, { x: i }))
        vi.advanceTimersByTime(100)
      }
      undo.stopCapturing()
      put(a, el('x', 22, 99, { x: 500 }))
      undo.undo()
      expect(map(a).get('x')?.x).toBe(20)
      undo.undo()
      expect(map(a).get('x')?.x).toBe(0)
      expect(undo.canUndo()).toBe(false)
    })
  })
})

describe('keys', () => {
  const press = (target: EventTarget, init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e
  }

  it('undoKeyAction', () => {
    expect(undoKeyAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('undo')
    expect(undoKeyAction({ key: 'Z', ctrlKey: false, metaKey: true, shiftKey: true })).toBe('redo')
    expect(undoKeyAction({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('redo')
    expect(undoKeyAction({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false })).toBe(null)
  })

  it('keyboardUndoUsesYjs', () => {
    const board = document.createElement('div')
    const canvas = document.createElement('div') // stands in for Excalidraw's own key handling
    board.append(canvas)
    document.body.append(board)
    const excalidraw = vi.fn()
    canvas.addEventListener('keydown', excalidraw)
    const undo = { undo: vi.fn(), redo: vi.fn() } as unknown as BoardUndo
    const unbind = bindUndoKeys(board, undo)

    const events = [
      press(canvas, { key: 'z', ctrlKey: true }),
      press(canvas, { key: 'y', ctrlKey: true }),
      press(canvas, { key: 'z', ctrlKey: true, shiftKey: true }),
      press(canvas, { key: 'z', metaKey: true }),
    ]
    expect(undo.undo).toHaveBeenCalledTimes(2)
    expect(undo.redo).toHaveBeenCalledTimes(2)
    expect(events.every((e) => e.defaultPrevented)).toBe(true)
    expect(excalidraw).not.toHaveBeenCalled()

    // inside the text editor, Ctrl+Z stays the text's own undo
    const editor = document.createElement('textarea')
    board.append(editor)
    const typed = press(editor, { key: 'z', ctrlKey: true })
    expect(typed.defaultPrevented).toBe(false)
    expect(undo.undo).toHaveBeenCalledTimes(2)

    unbind()
    press(canvas, { key: 'z', ctrlKey: true })
    expect(excalidraw).toHaveBeenCalledTimes(1)
    board.remove()
  })
})
