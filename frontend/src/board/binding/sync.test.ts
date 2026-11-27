import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS } from '../format'
import { LOCAL, createThrottle, pushLocal, sceneFromDoc, writeBackLosers, type El } from './sync'
import { createUndo } from './undo'

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
const elements = (doc: Y.Doc) => doc.getMap<El>(ELEMENTS)
const sync = (from: Y.Doc, to: Y.Doc) => Y.applyUpdate(to, Y.encodeStateAsUpdate(from), 'remote')
const docWithId = (clientID: number) => {
  const d = new Y.Doc()
  d.clientID = clientID
  return d
}
const idle = { editingId: null, drawingFreedraw: false }

describe('pushLocal', () => {
  it('localEditSetsMap', () => {
    const doc = new Y.Doc()
    const origins: unknown[] = []
    doc.on('afterTransaction', (t) => origins.push(t.origin))
    const sent = pushLocal(doc, [el('a', 1, 5)], new Map(), idle)
    expect(sent).toEqual(['a'])
    expect(elements(doc).get('a')).toEqual(el('a', 1, 5))
    expect(origins).toEqual([LOCAL])
  })

  it('unchangedVersionNotResent', () => {
    const doc = new Y.Doc()
    const known = new Map<string, number>()
    pushLocal(doc, [el('a', 1, 5)], known, idle)
    expect(pushLocal(doc, [el('a', 1, 5)], known, idle)).toEqual([])
    expect(pushLocal(doc, [el('a', 2, 6)], known, idle)).toEqual(['a'])
  })

  it('freedrawSentOnlyOnFinish', () => {
    const doc = new Y.Doc()
    const known = new Map<string, number>()
    const stroke = el('f', 3, 1, { type: 'freedraw', points: [[0, 0], [1, 1]] })
    expect(pushLocal(doc, [stroke], known, { editingId: 'f', drawingFreedraw: true })).toEqual([])
    expect(elements(doc).has('f')).toBe(false)
    expect(pushLocal(doc, [stroke], known, idle)).toEqual(['f'])
  })
})

describe('createThrottle', () => {
  afterEach(() => vi.useRealTimers())

  it('throttleAtMostTenPerSecond', () => {
    vi.useFakeTimers()
    const throttle = createThrottle(100)
    const runs: number[] = []
    for (let i = 0; i < 50; i++) {
      if (i > 0) vi.advanceTimersByTime(20)
      throttle(() => runs.push(i))
    } // 50 calls in t = 0..980 ms
    expect(runs.length).toBeLessThanOrEqual(10)
    expect(runs[0]).toBe(0) // leading
    vi.advanceTimersByTime(200)
    expect(runs.at(-1)).toBe(49) // trailing: the last call always runs
  })
})

describe('sceneFromDoc', () => {
  it('remoteSetBuildsSortedScene', () => {
    const remote = new Y.Doc()
    remote.transact(() => {
      elements(remote).set('c', el('c', 1, 1, { index: 'a2' }))
      elements(remote).set('a', el('a', 1, 1, { index: 'a0' }))
      elements(remote).set('b2', el('b2', 1, 1, { index: 'a1' }))
      elements(remote).set('b1', el('b1', 1, 1, { index: 'a1' }))
      elements(remote).set('z', el('z', 1, 1, { index: null }))
    })
    const doc = new Y.Doc()
    sync(remote, doc)
    expect(sceneFromDoc(doc, [], null).map((e) => e.id)).toEqual(['a', 'b1', 'b2', 'c', 'z'])
  })

  it('remoteChangeDeferredWhileEditing', () => {
    const doc = new Y.Doc()
    const known = new Map<string, number>()
    pushLocal(doc, [el('t', 2, 1, { type: 'text', text: 'he' })], known, idle)
    const remote = new Y.Doc()
    sync(doc, remote)
    elements(remote).set('t', el('t', 3, 1, { type: 'text', text: 'theirs' }))
    sync(remote, doc)

    // I'm still typing: my copy stays on screen
    const mine = el('t', 3, 9, { type: 'text', text: 'hello' })
    expect(sceneFromDoc(doc, [mine], 't')[0].text).toBe('hello')

    // I finish with a higher version: mine is written back and wins
    const finished = el('t', 4, 9, { type: 'text', text: 'hello' })
    expect(writeBackLosers(doc, [finished], ['t'])).toEqual(['t'])
    expect(sceneFromDoc(doc, [finished], null)[0].text).toBe('hello')

    // a later remote change I didn't touch applies once I'm not editing
    sync(doc, remote)
    elements(remote).set('t', el('t', 6, 1, { type: 'text', text: 'later' }))
    sync(remote, doc)
    expect(writeBackLosers(doc, [finished], ['t'])).toEqual([])
    expect(sceneFromDoc(doc, [finished], null)[0].text).toBe('later')
  })
})

describe('conflicts', () => {
  const permutations = <T,>(xs: T[]): T[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))

  it('concurrentEditsConvergeAnyOrder', () => {
    const edits = [el('x', 4, 1, { x: 40 }), el('x', 5, 7, { x: 57 }), el('x', 5, 3, { x: 53 })]
    const winner = edits[2] // highest version, lowest nonce on the tie
    for (const order of permutations([0, 1, 2])) {
      for (const ids of permutations([1, 2, 3])) {
        const base = new Y.Doc()
        elements(base).set('x', el('x', 1, 1))
        const clients = ids.map((id) => {
          const d = docWithId(id)
          sync(base, d)
          return d
        })
        clients.forEach((d, i) => pushLocal(d, [edits[i]], new Map([['x', 1]]), idle))
        const server = docWithId(100)
        sync(base, server)
        for (const i of order) sync(clients[i], server)
        for (let round = 0; round < 2; round++) {
          clients.forEach((d, i) => {
            sync(server, d)
            writeBackLosers(d, [edits[i]], ['x'])
            sync(d, server)
          })
        }
        clients.forEach((d) => sync(server, d))
        for (const d of [server, ...clients]) expect(elements(d).get('x'), `order ${order} ids ${ids}`).toEqual(winner)
      }
    }
  })

  it('tombstonesMerge', () => {
    const a = docWithId(1)
    const b = docWithId(2)
    elements(a).set('x', el('x', 5, 1))
    sync(a, b)
    const deleted = el('x', 6, 4, { isDeleted: true })
    const moved = el('x', 6, 8, { x: 99 }) // same version, higher nonce: loses
    pushLocal(a, [deleted], new Map([['x', 5]]), idle)
    pushLocal(b, [moved], new Map([['x', 5]]), idle)
    sync(a, b)
    sync(b, a)
    writeBackLosers(a, [deleted], ['x'])
    writeBackLosers(b, [moved], ['x'])
    sync(a, b)
    sync(b, a)
    expect(elements(a).get('x')).toEqual(deleted)
    expect(elements(b).get('x')).toEqual(deleted)
  })

  // The server keeps whichever value Yjs picks; a write that arrives after a concurrent one Yjs prefers changes
  // nothing there, so no server rule can see it. The browser that made it sees the other value arrive and writes
  // its newer copy back.
  it('serverDropsSimultaneousWriteBrowserWritesBack', () => {
    const base = new Y.Doc()
    elements(base).set('x', el('x', 5, 1))
    const a = docWithId(1) // Yjs prefers the higher client id on a concurrent set
    const b = docWithId(2)
    const server = docWithId(3)
    for (const d of [a, b, server]) sync(base, d)

    const newer = el('x', 7, 1, { x: 70 })
    pushLocal(a, [newer], new Map([['x', 5]]), idle)
    pushLocal(b, [el('x', 6, 1, { x: 60 })], new Map([['x', 5]]), idle)
    sync(b, server)
    sync(a, server)
    expect(elements(server).get('x')?.version).toBe(6) // a's write was dropped

    sync(server, a)
    expect(writeBackLosers(a, [newer], ['x'])).toEqual(['x'])
    sync(a, server)
    sync(server, b)
    for (const d of [a, b, server]) expect(elements(d).get('x')).toEqual(newer)
  })

  it('writeBackIsNotAnUndoStep', () => {
    const a = docWithId(1)
    const b = docWithId(2)
    elements(a).set('x', el('x', 1, 1))
    sync(a, b)
    const undo = createUndo(a)
    const mine = el('x', 3, 1, { x: 30 })
    pushLocal(a, [mine], new Map([['x', 1]]), idle)
    undo.stopCapturing()
    pushLocal(b, [el('x', 2, 1, { x: 20 })], new Map([['x', 1]]), idle)
    sync(b, a) // b's older edit wins Yjs's tie-break
    expect(writeBackLosers(a, [mine], ['x'])).toEqual(['x'])
    undo.undo() // one press takes my drag back, not just the write-back
    expect(elements(a).get('x')?.x).toBe(0)
    expect(undo.canUndo()).toBe(false)
  })
})
