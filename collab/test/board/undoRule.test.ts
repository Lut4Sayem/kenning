// The browser's board undo against the server's newer-version rule: an undo must stick on the server.
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { guardBoard } from '../../src/board/guard.js'
import { ELEMENTS } from '../../src/board/format.js'
import { LOCAL, createUndo } from '../../../frontend/src/board/binding/undo.js'

type El = { id: string; version: number; [k: string]: unknown }
const el = (id: string, version: number, x: number): El => ({
  id,
  type: 'rectangle',
  version,
  versionNonce: version * 10,
  isDeleted: false,
  index: 'a0',
  updated: 1,
  x,
})
const map = (doc: Y.Doc) => doc.getMap<El>(ELEMENTS)

/** A browser doc and a guarded server doc, live-synced both ways. */
function connected() {
  const server = new Y.Doc()
  guardBoard(server, 'node-1')
  const a = new Y.Doc()
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server))
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'server-sync' && Y.applyUpdate(server, u, 'client'))
  server.on('update', (u: Uint8Array, origin: unknown) => origin !== 'client' && Y.applyUpdate(a, u, 'server-sync'))
  return { a, server, undo: createUndo(a) }
}

describe('board undo and the server version rule', () => {
  it('undoSurvivesServerVersionRule', () => {
    const { a, server, undo } = connected()
    a.transact(() => map(a).set('x', el('x', 6, 0)), LOCAL)
    undo.stopCapturing()
    a.transact(() => map(a).set('x', el('x', 7, 70)), LOCAL)
    undo.undo()
    expect(map(server).get('x')?.x).toBe(0)
    expect(map(a).get('x')?.x).toBe(0)
    expect(map(a).get('x')).toEqual(map(server).get('x'))
  })

  it('undoOfCreateSurvivesServer', () => {
    const { a, server, undo } = connected()
    a.transact(() => map(a).set('x', el('x', 1, 5)), LOCAL)
    undo.undo()
    expect(map(server).get('x')?.isDeleted).toBe(true)
    expect(map(a).get('x')).toEqual(map(server).get('x'))
  })
})
