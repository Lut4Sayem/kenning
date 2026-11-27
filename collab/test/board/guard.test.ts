import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS, EMPTY_BOARD_STATE, META } from '../../src/board/format.js'
import { guardBoard } from '../../src/board/guard.js'
import { fixIndexClashes, sanitizeChanged } from '../../src/board/sanitize.js'

vi.mock('../../src/board/sanitize.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/board/sanitize.js')>()
  return { ...real, sanitizeChanged: vi.fn(real.sanitizeChanged), fixIndexClashes: vi.fn(real.fixIndexClashes) }
})

type El = Record<string, unknown>
const el = (id: string, extra: El = {}): El =>
  ({ id, type: 'rectangle', version: 1, versionNonce: 1, isDeleted: false, index: 'a0', updated: Date.now(), ...extra })
const CLIENT = 'client'

function guarded(): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, Buffer.from(EMPTY_BOARD_STATE, 'base64'), 'spring')
  guardBoard(doc, 'n1')
  return doc
}

let logs: ReturnType<typeof vi.spyOn> | undefined
afterEach(() => {
  logs?.mockRestore()
  logs = undefined
})

describe('guardBoard', () => {
  it('observerNeverThrows', () => {
    logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const doc = guarded()
    const map = doc.getMap<El>(ELEMENTS)
    vi.mocked(sanitizeChanged).mockImplementationOnce(() => { throw new Error('secret content') })
    expect(() => doc.transact(() => map.set('a', el('a')), CLIENT)).not.toThrow()
    const lines = logs.mock.calls.map((c) => JSON.parse(String(c[0])))
    const line = lines.find((l) => l.event === 'board-sanitize-error')
    expect(line).toMatchObject({ nodeId: 'n1' })
    expect(JSON.stringify(line)).not.toContain('secret')
    // later updates are still checked
    doc.transact(() => map.set('img', el('img', { type: 'image' })), CLIENT)
    expect(map.has('img')).toBe(false)
  })

  it('indexFixSkippedWhenNoIndexChanged', () => {
    const doc = guarded()
    const map = doc.getMap<El>(ELEMENTS)
    const fix = vi.mocked(fixIndexClashes)
    fix.mockClear()
    doc.transact(() => map.set('a', el('a')), CLIENT)
    expect(fix).toHaveBeenCalledTimes(1) // added
    fix.mockClear()
    doc.transact(() => map.set('a', el('a', { version: 2, x: 5 })), CLIENT)
    expect(fix).not.toHaveBeenCalled()
    doc.transact(() => map.set('a', el('a', { version: 3, index: 'a1' })), CLIENT)
    expect(fix).toHaveBeenCalledTimes(1)
  })

  it('metaGuarded', () => {
    const doc = guarded()
    const meta = doc.getMap<unknown>(META)
    let origin: unknown
    doc.on('afterTransaction', (tr: Y.Transaction) => { origin = tr.origin })
    doc.transact(() => {
      meta.set('extra', 'x')
      meta.set('formatVersion', 2)
    }, CLIENT)
    expect(meta.toJSON()).toEqual({ formatVersion: 1 })
    expect(origin).toBe('server')
    doc.transact(() => meta.delete('formatVersion'), CLIENT)
    expect(meta.toJSON()).toEqual({ formatVersion: 1 })
  })
})
