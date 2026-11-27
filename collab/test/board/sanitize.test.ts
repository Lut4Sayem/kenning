import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS, TOMBSTONE_KEEP } from '../../src/board/format.js'
import { SERVER, fixIndexClashes, sanitizeChanged, slimTombstones } from '../../src/board/sanitize.js'

type El = Record<string, unknown>
const HOUR = 3_600_000
const NOW = 1_800_000_000_000

function el(id: string, extra: El = {}): El {
  return { id, type: 'rectangle', version: 1, versionNonce: 100, isDeleted: false, index: 'a0', updated: NOW, ...extra }
}

// Collects key -> oldValue from every change to the elements map, like the server observer will.
function watch(doc: Y.Doc): Map<string, unknown> {
  const changed = new Map<string, unknown>()
  doc.getMap(ELEMENTS).observe((e) => e.changes.keys.forEach((c, k) => changed.set(k, c.oldValue)))
  return changed
}

function newDoc(clientID?: number): Y.Doc {
  const doc = new Y.Doc()
  if (clientID !== undefined) doc.clientID = clientID
  return doc
}

describe('sanitizeChanged', () => {
  it('sanitizerRemovesForbiddenTypes', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<El>(ELEMENTS)
    for (const type of ['image', 'iframe', 'frame', 'mystery']) map.set(type, el(type, { type }))
    map.set('ok', el('ok'))
    const removed = sanitizeChanged(doc, changed)
    expect(removed).toEqual(['image', 'iframe', 'frame', 'mystery'].map((id) => ({ id, reason: 'type' })))
    expect([...map.keys()]).toEqual(['ok'])
  })

  it('sanitizerRemovesMalformed', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<unknown>(ELEMENTS)
    map.set('str', 'hello')
    map.set('nul', null)
    map.set('arr', [1, 2])
    map.set('noId', { type: 'rectangle' })
    map.set('noType', { id: 'noType' })
    map.set('wrongKey', el('other'))
    map.set('noVersion', { id: 'noVersion', type: 'rectangle', versionNonce: 1 })
    map.set('strVersion', el('strVersion', { version: '5' }))
    map.set('noNonce', el('noNonce', { versionNonce: undefined }))
    const removed = sanitizeChanged(doc, changed)
    expect(removed.map((r) => r.id).sort()).toEqual(['arr', 'noId', 'noNonce', 'noType', 'noVersion', 'nul', 'str', 'strVersion', 'wrongKey'])
    expect(removed.every((r) => r.reason === 'malformed')).toBe(true)
    expect(map.size).toBe(0)
  })

  it('sanitizerRemovesOversized', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<El>(ELEMENTS)
    map.set('draw', el('draw', { type: 'freedraw', points: Array.from({ length: 5001 }, () => [0, 0]) }))
    map.set('drawOk', el('drawOk', { type: 'freedraw', points: Array.from({ length: 5000 }, () => [0, 0]) }))
    map.set('text', el('text', { type: 'text', text: 'x'.repeat(10_001) }))
    map.set('orig', el('orig', { type: 'text', text: 'x', originalText: 'x'.repeat(10_001) }))
    map.set('textOk', el('textOk', { type: 'text', text: 'x'.repeat(10_000) }))
    map.set('custom', el('custom', { customData: { s: 'x'.repeat(1025 - 8) } })) // {"s":"..."} = 1,025 bytes
    map.set('customOk', el('customOk', { customData: { s: 'x'.repeat(1024 - 8) } }))
    map.set('big', el('big', { pad: 'x'.repeat(262_144) }))
    const atLimit = el('atLimit', { pad: '' })
    atLimit.pad = 'x'.repeat(262_144 - Buffer.byteLength(JSON.stringify(atLimit)))
    expect(Buffer.byteLength(JSON.stringify(atLimit))).toBe(262_144)
    map.set('atLimit', atLimit)
    const removed = sanitizeChanged(doc, changed)
    expect(removed).toEqual([
      { id: 'draw', reason: 'points' },
      { id: 'text', reason: 'text' },
      { id: 'orig', reason: 'text' },
      { id: 'custom', reason: 'customData' },
      { id: 'big', reason: 'size' },
    ])
    expect([...map.keys()].sort()).toEqual(['atLimit', 'customOk', 'drawOk', 'textOk'])
  })

  it('sanitizerRemovesNonStringText', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<El>(ELEMENTS)
    map.set('num', el('num', { type: 'text', text: 5 }))
    map.set('obj', el('obj', { type: 'text', text: 'x', originalText: { length: 1 } }))
    map.set('ok', el('ok', { type: 'text', text: 'x' }))
    expect(sanitizeChanged(doc, changed)).toEqual([{ id: 'num', reason: 'malformed' }, { id: 'obj', reason: 'malformed' }])
    expect([...map.keys()]).toEqual(['ok'])
  })

  it('sanitizerSurvivesUnserializable', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<El>(ELEMENTS)
    doc.transact(() => {
      map.set('big', el('big', { pad: 10n })) // Yjs stores BigInt; JSON.stringify throws on it
      map.set('img', el('img', { type: 'image' }))
    })
    expect(sanitizeChanged(doc, changed)).toEqual([{ id: 'big', reason: 'malformed' }, { id: 'img', reason: 'type' }])
    expect(map.size).toBe(0)
  })

  it('sanitizerKeepsValidAndDanglingBindings', () => {
    const doc = newDoc()
    const changed = watch(doc)
    const map = doc.getMap<El>(ELEMENTS)
    const arrow = el('arrow', { type: 'arrow', points: [[0, 0], [10, 10]], startBinding: { elementId: 'gone', focus: 0, gap: 1 }, endBinding: null })
    const text = el('label', { type: 'text', text: 'hi', containerId: 'gone' })
    map.set('arrow', arrow)
    map.set('label', text)
    expect(sanitizeChanged(doc, changed)).toEqual([])
    expect(map.get('arrow')).toEqual(arrow)
    expect(map.get('label')).toEqual(text)
  })

  it('invalidWriteRestoresPrevious', () => {
    const doc = newDoc()
    const map = doc.getMap<El>(ELEMENTS)
    const v5 = el('a', { version: 5 })
    map.set('a', v5)
    const changed = watch(doc)
    map.set('a', el('a', { type: 'image', version: 6 }))
    expect(sanitizeChanged(doc, changed)).toEqual([{ id: 'a', reason: 'type' }])
    expect(map.get('a')).toEqual(v5)
  })

  it('rawDeleteRestoresTombstone', () => {
    const doc = newDoc()
    const map = doc.getMap<El>(ELEMENTS)
    const tombstone = el('t', { version: 5, isDeleted: true })
    map.set('t', tombstone)
    const changed = watch(doc)
    map.delete('t')
    let origin: unknown
    doc.on('afterTransaction', (tr: Y.Transaction) => { origin = tr.origin })
    expect(sanitizeChanged(doc, changed)).toEqual([{ id: 't', reason: 'deleted' }])
    expect(origin).toBe(SERVER)
    expect(map.get('t')).toEqual(tombstone)
  })

  it('writesNothingWhenAllValid', () => {
    const doc = newDoc()
    const changed = watch(doc)
    doc.getMap<El>(ELEMENTS).set('ok', el('ok'))
    let transactions = 0
    doc.on('afterTransaction', () => { transactions++ })
    expect(sanitizeChanged(doc, changed)).toEqual([])
    expect(slimTombstones(doc, NOW)).toBe(0)
    expect(transactions).toBe(0)
  })

  it('lowerVersionNeverWins', () => {
    const doc = newDoc()
    const map = doc.getMap<El>(ELEMENTS)
    map.set('a', el('a', { version: 6 }))
    map.set('b', el('b', { version: 6, versionNonce: 100 }))
    map.set('c', el('c', { version: 6, versionNonce: 100 }))
    const changed = watch(doc)
    map.set('a', el('a', { version: 4 }))
    map.set('b', el('b', { version: 6, versionNonce: 200 }))
    map.set('c', el('c', { version: 7, versionNonce: 999 }))
    let origin: unknown
    doc.on('afterTransaction', (tr: Y.Transaction) => { origin = tr.origin })
    expect(sanitizeChanged(doc, changed)).toEqual([{ id: 'a', reason: 'stale' }, { id: 'b', reason: 'stale' }])
    expect(origin).toBe(SERVER)
    expect(map.get('a')!.version).toBe(6)
    expect(map.get('b')!.versionNonce).toBe(100)
    expect(map.get('c')!.version).toBe(7)
  })

  it('staleCopyCannotResurrectSlimmed', () => {
    const live = el('s', { version: 3, versionNonce: 7, points: [[0, 0]], text: 'heavy' })
    const server = newDoc(1)
    server.getMap<El>(ELEMENTS).set('s', el('s', { version: 2 }))
    const stale = newDoc(2) // higher client id, so Yjs picks its concurrent write
    Y.applyUpdate(stale, Y.encodeStateAsUpdate(server))

    const tombstone = { id: 's', type: 'rectangle', version: 5, versionNonce: 9, isDeleted: true, index: 'a0', updated: NOW - 25 * HOUR }
    server.getMap<El>(ELEMENTS).set('s', tombstone)
    stale.getMap<El>(ELEMENTS).set('s', live)

    const changed = watch(server)
    Y.applyUpdate(server, Y.encodeStateAsUpdate(stale))
    expect(server.getMap<El>(ELEMENTS).get('s')).toEqual(live) // raw merge: the stale copy won the tie-break
    expect(sanitizeChanged(server, changed)).toEqual([{ id: 's', reason: 'stale' }])
    expect(server.getMap<El>(ELEMENTS).get('s')).toEqual(tombstone)
  })
})

describe('slimTombstones', () => {
  it('slimsOnlyOldTombstones', () => {
    const doc = newDoc()
    const map = doc.getMap<El>(ELEMENTS)
    const heavy = { points: [[0, 0], [1, 1]], text: 'secret', strokeColor: '#000' }
    map.set('old', el('old', { ...heavy, version: 5, isDeleted: true, updated: NOW - 25 * HOUR }))
    const recent = el('recent', { ...heavy, isDeleted: true, updated: NOW - 23 * HOUR })
    const alive = el('alive', { ...heavy, updated: NOW - 100 * HOUR })
    map.set('recent', recent)
    map.set('alive', alive)
    let origin: unknown
    doc.on('afterTransaction', (tr: Y.Transaction) => { origin = tr.origin })

    expect(slimTombstones(doc, NOW)).toBe(1)
    expect(origin).toBe(SERVER)
    expect(Object.keys(map.get('old')!).sort()).toEqual([...TOMBSTONE_KEEP].sort())
    expect(map.get('old')!.version).toBe(5)
    expect(map.get('recent')).toEqual(recent)
    expect(map.get('alive')).toEqual(alive)
    expect(slimTombstones(doc, NOW)).toBe(0)
  })
})

describe('fixIndexClashes', () => {
  it('indexClashFixedByServerOnly', () => {
    const doc = newDoc()
    const map = doc.getMap<El>(ELEMENTS)
    map.set('first', el('first', { index: 'a0' }))
    map.set('x', el('x', { index: 'a1', version: 3, versionNonce: 5 }))
    map.set('y', el('y', { index: 'a1', version: 3, versionNonce: 5 }))
    map.set('last', el('last', { index: 'a2' }))
    map.set('noIndex', el('noIndex', { index: null }))
    map.set('badIndex', el('badIndex', { index: 'a10' })) // trailing zero: rejected by generateKeyBetween
    let origin: unknown
    doc.on('afterTransaction', (tr: Y.Transaction) => { origin = tr.origin })

    expect(fixIndexClashes(doc)).toBe(3)
    expect(origin).toBe(SERVER)
    expect(map.get('x')!.index).toBe('a1')
    const y = map.get('y')!
    expect(y.index! > 'a1' && y.index! < 'a2').toBe(true)
    expect(y.version).toBe(4)
    expect(y.versionNonce).not.toBe(5)
    for (const id of ['noIndex', 'badIndex']) expect(map.get(id)!.index! > 'a2').toBe(true)
    expect(map.get('noIndex')!.index).not.toBe(map.get('badIndex')!.index)
    expect(fixIndexClashes(doc)).toBe(0)
  })
})
