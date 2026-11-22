import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createServer, type Options } from '../src/server.js'
import { TooLargeError } from '../src/spring.js'
import { connect, fakeSpring, ticket, testConfig, typeIn, until, type Client, type FakeSpring } from './helpers.js'

let server: ReturnType<typeof createServer> | undefined
const clients: Client[] = []
afterEach(async () => {
  clients.splice(0).forEach((c) => c.provider.destroy())
  await server?.destroy()
  server = undefined
})

async function start(spring: FakeSpring = fakeSpring(), opts: Partial<Options> = {}) {
  server = createServer(testConfig(), spring, { debounce: 50, maxDebounce: 200, ...opts })
  await server.listen()
  return server.address.port
}
const open = (port: number, name: string, over = {}) => {
  const c = connect(port, name, ticket({ nodeId: name, ...over }))
  clients.push(c)
  return c
}
const text = (c: Client) => c.doc.getXmlFragment('document-store').toString()

describe('limits', () => {
  it('rejectsThe26thConnectionToAPage', async () => {
    const port = await start()
    const in25 = Array.from({ length: 25 }, (_, i) => open(port, 'n1', { userId: `u${i}` }))
    await Promise.all(in25.map((c) => c.synced))
    expect(await open(port, 'n1', { userId: 'late' }).failed).toBe('too-many')
  })

  it('rejectsThe11thSocketOfOneUser', async () => {
    const port = await start()
    const mine = Array.from({ length: 10 }, (_, i) => open(port, `p${i}`, { userId: 'u1' }))
    await Promise.all(mine.map((c) => c.synced))
    expect(await open(port, 'p10', { userId: 'u1' }).failed).toBe('too-many')
    mine[0].provider.destroy() // one closed: room again
    await new Promise((r) => setTimeout(r, 200))
    await open(port, 'p11', { userId: 'u1' }).synced
  })

  it('aFloodingClientIsClosedWith4429', async () => {
    const port = await start(fakeSpring(), { burst: 20 })
    const c = open(port, 'n1')
    await c.synced
    for (let i = 0; i < 200; i++) c.doc.getText('t').insert(0, 'x')
    await until(() => c.closes.includes(4429))
  })

  it('anOversizedMessageIsRefused', async () => {
    const port = await start()
    const c = open(port, 'n1')
    await c.synced
    c.doc.getText('t').insert(0, 'x'.repeat(2 * 1024 * 1024)) // one 2 MB update, over the 1 MB message cap
    await until(() => c.closes.length > 0)
    expect(server!.hocuspocus.documents.get('n1')?.getText('t').length ?? 0).toBe(0)
  })

  it('pastTheSizeLimitEveryoneIsReadOnly', async () => {
    const spring = fakeSpring()
    const port = await start(spring, { maxStateBytes: 400 })
    const a = open(port, 'n1', { userId: 'a' })
    const b = open(port, 'n1', { userId: 'b' })
    await Promise.all([a.synced, b.synced])
    typeIn(a.doc, 'y'.repeat(300))
    await until(() => a.messages.some((m) => m.type === 'too-large') && b.messages.some((m) => m.type === 'too-large'))
    await until(() => spring.stores.length === 1) // what was typed before the limit is still stored
    // then every client is told the store after the cap is done: its edits not in a `saved` were refused
    await until(() => a.messages.some((m) => m.type === 'too-large' && m.final))
    const types = a.messages.map((m) => (m.final ? 'final' : m.type))
    expect(types.lastIndexOf('saved')).toBeLessThan(types.indexOf('final'))
    typeIn(b.doc, 'refused')
    await new Promise((r) => setTimeout(r, 300))
    expect(text(a)).not.toContain('refused')
    const late = open(port, 'n1', { userId: 'c' })
    await until(() => late.messages.some((m) => m.type === 'too-large' && m.final)) // newcomers are told too
    // with what was stored, so a client that missed the `saved` can still tell its edits were kept
    const final = late.messages.find((m) => m.final)!
    expect(final.snap).toBe(a.messages.filter((m) => m.type === 'saved').at(-1)!.snap)
  })

  it('springRefusingTheSizeStopsRetrying', async () => {
    const spring = fakeSpring()
    spring.storeImpl = async () => {
      throw new TooLargeError()
    }
    const port = await start(spring, { backoff: [50] })
    const c = open(port, 'n1')
    await c.synced
    typeIn(c.doc, 'big')
    await until(() => c.messages.some((m) => m.type === 'too-large' && m.final))
    await new Promise((r) => setTimeout(r, 300))
    expect(spring.stores).toHaveLength(1)
    expect(c.messages.some((m) => m.type === 'saved')).toBe(false)
  })

  // Review finding: the running estimate counts moved or re-typed content twice; the real size decides.
  it('movingContentAroundDoesNotHitTheLimit', async () => {
    const spring = fakeSpring()
    const port = await start(spring, { maxStateBytes: 5000 })
    const a = open(port, 'n1', { userId: 'a' })
    await a.synced
    const paragraph = ((a.doc.getXmlFragment('document-store').get(0) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlElement
    for (let i = 0; i < 3; i++) {
      typeIn(a.doc, 'y'.repeat(2000))
      paragraph.delete(0, paragraph.length) // cut... and paste again on the next turn
    }
    typeIn(a.doc, 'y'.repeat(2000))
    await until(() => spring.stores.length === 1)
    expect(a.messages.some((m) => m.type === 'too-large' || (m.type === 'size' && m.near))).toBe(false)
  })

  it('warnsAt90PercentAndClearsBelow85', async () => {
    const spring = fakeSpring()
    const port = await start(spring, { maxStateBytes: 4000 })
    const a = open(port, 'n1', { userId: 'a' })
    await a.synced
    typeIn(a.doc, 'y'.repeat(3700)) // over 90 % of 4000
    await until(() => a.messages.some((m) => m.type === 'size' && m.near === true))
    expect(a.messages.some((m) => m.type === 'too-large')).toBe(false)
    const late = open(port, 'n1', { userId: 'b' })
    await until(() => late.messages.some((m) => m.type === 'size' && m.near === true)) // newcomers are told too
    await until(() => spring.stores.length === 1)
    const paragraph = ((a.doc.getXmlFragment('document-store').get(0) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlElement
    paragraph.delete(0, paragraph.length) // the page shrinks
    await until(() => a.messages.some((m) => m.type === 'size' && m.near === false))
  })
})
