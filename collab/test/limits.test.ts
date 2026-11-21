import { afterEach, describe, expect, it } from 'vitest'
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
    expect(spring.stores).toHaveLength(1) // what was typed before the limit is still stored
    typeIn(b.doc, 'refused')
    await new Promise((r) => setTimeout(r, 300))
    expect(text(a)).not.toContain('refused')
    const late = open(port, 'n1', { userId: 'c' })
    await until(() => late.messages.some((m) => m.type === 'too-large')) // newcomers are told too
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
    await until(() => c.messages.some((m) => m.type === 'too-large'))
    await new Promise((r) => setTimeout(r, 300))
    expect(spring.stores).toHaveLength(1)
  })
})
