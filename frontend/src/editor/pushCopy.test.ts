import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { toBase64 } from './base64'
import { pushDoc } from './pushCopy'

// The provider is replaced by a stand-in that hands its options to the test, which plays the service.
const fake = vi.hoisted(() => ({ last: undefined as undefined | Record<string, (...a: never[]) => unknown>, destroyed: 0 }))
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    constructor(options: Record<string, (...a: never[]) => unknown>) {
      fake.last = options
    }
    destroy() {
      fake.destroyed++
    }
  },
}))
const ticketApi = vi.hoisted(() => ({ getTicket: vi.fn() }))
vi.mock('../api/collab', () => ticketApi)

const docWith = (text: string) => {
  const d = new Y.Doc()
  d.getText('t').insert(0, text)
  return d
}
const saved = (doc: Y.Doc) => JSON.stringify({ type: 'saved', revision: 2, sv: toBase64(Y.encodeStateVector(doc)) })
const token = () => (fake.last!.token as () => Promise<string>)()
const stateless = (payload: string) => (fake.last!.onStateless as (d: { payload: string }) => void)({ payload })

beforeEach(() => {
  vi.useFakeTimers()
  fake.destroyed = 0
  ticketApi.getTicket.mockResolvedValue({ ticket: 't', access: 'EDIT', epoch: 0 })
})
afterEach(() => vi.useRealTimers())

describe('pushDoc', () => {
  it('trueOnceTheServiceStoredAllOfIt', async () => {
    const doc = docWith('kept offline')
    const result = pushDoc('n1', doc, 0)
    expect(await token()).toBe('t')
    stateless(saved(new Y.Doc())) // an unrelated earlier store
    stateless(saved(doc))
    expect(await result).toBe(true)
    expect(fake.destroyed).toBe(1)
  })

  it('falseWhenThePageWasRestoredMeanwhile', async () => {
    ticketApi.getTicket.mockResolvedValue({ ticket: 't', access: 'EDIT', epoch: 1 })
    const result = pushDoc('n1', docWith('x'), 0)
    await expect(token()).rejects.toThrow()
    expect(await result).toBe(false)
  })

  it('falseWithoutEditAccess', async () => {
    ticketApi.getTicket.mockResolvedValue({ ticket: 't', access: 'VIEW', epoch: 0 })
    const result = pushDoc('n1', docWith('x'), 0)
    await expect(token()).rejects.toThrow()
    expect(await result).toBe(false)
  })

  it('falseAfterTheTimeout', async () => {
    const result = pushDoc('n1', docWith('x'), 0, 15_000)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toBe(false)
    expect(fake.destroyed).toBe(1)
  })
})
