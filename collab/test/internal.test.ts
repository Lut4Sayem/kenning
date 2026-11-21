import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Options } from '../src/server.js'
import { connect, fakeSpring, SECRET, ticket, testConfig, typeIn, until, type Client, type FakeSpring } from './helpers.js'

let server: ReturnType<typeof createServer> | undefined
const clients: Client[] = []
afterEach(async () => {
  clients.splice(0).forEach((c) => c.provider.destroy())
  await server?.destroy()
  server = undefined
})

async function start(spring: FakeSpring, opts: Partial<Options> = {}) {
  server = createServer(testConfig(), spring, { debounce: 50, maxDebounce: 200, ...opts })
  await server.listen()
  return server.address.port
}
const join = async (port: number, over = {}, token?: () => Promise<string>) => {
  const c = connect(port, 'n1', token ?? ticket(over))
  clients.push(c)
  await c.synced
  return c
}
const call = (port: number, path: string, body: unknown = {}, secret = SECRET) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'X-Collab-Secret': secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('internal routes', () => {
  it('internalNeedsSecret', async () => {
    const port = await start(fakeSpring())
    expect((await call(port, '/internal/revalidate', {}, 'wrong')).status).toBe(403)
    expect((await fetch(`http://127.0.0.1:${port}/internal/revalidate`, { method: 'POST' })).status).toBe(403)
    expect((await call(port, '/internal/revalidate', {})).status).toBe(204)
  })

  it('resetClosesWith4409AndSkipsStore', async () => {
    const spring = fakeSpring()
    const port = await start(spring, { debounce: 5000, maxDebounce: 10_000 })
    const c = await join(port)
    typeIn(c.doc, 'typed before the restore')
    await new Promise((r) => setTimeout(r, 100)) // reaches the service, store still waiting
    spring.loaded = { ...spring.loaded, epoch: 1 } // Spring restored the page
    expect((await call(port, '/internal/nodes/n1/reset')).status).toBe(204)
    await until(() => c.closes.includes(4409))
    expect(spring.stores).toHaveLength(0) // the old lineage is never stored
    await until(() => !server!.hocuspocus.documents.has('n1'))
  })

  it('revalidateClosesWith4403AndTheClientComesBack', async () => {
    const port = await start(fakeSpring())
    let tickets = 0
    const c = await join(port, {}, async () => (tickets++, ticket()))
    expect((await call(port, '/internal/revalidate', { nodeIds: ['n1', 'other'] })).status).toBe(204)
    await until(() => c.closes.includes(4403))
    await until(() => tickets === 2) // reconnected with a fresh ticket
  })

  it('aTicketIssuedBeforeARevalidateIsRefused', async () => {
    const port = await start(fakeSpring())
    const early = ticket({ iat: Date.now() - 1000 }) // fetched just before the page was trashed
    await call(port, '/internal/revalidate', { nodeIds: ['n1'] })
    const c = connect(port, 'n1', early)
    clients.push(c)
    expect(await c.failed).toBe('stale-ticket')
    await join(port) // a fresh ticket is fine
  })

  it('revalidateUserClosesItsSockets', async () => {
    const port = await start(fakeSpring())
    const gone = await join(port, { userId: 'removed' })
    const stays = await join(port, { userId: 'other' })
    await call(port, '/internal/revalidate', { userId: 'removed' })
    await until(() => gone.closes.includes(4403))
    await new Promise((r) => setTimeout(r, 100))
    expect(stays.closes).toEqual([])
  })

  it('flushStoresNow', async () => {
    const spring = fakeSpring()
    const port = await start(spring, { debounce: 60_000, maxDebounce: 120_000 })
    const c = await join(port)
    typeIn(c.doc, 'for the named version')
    await until(() => server!.hocuspocus.debouncer.isDebounced('onStoreDocument-n1'))
    const res = await call(port, '/internal/nodes/n1/flush')
    expect(await res.json()).toEqual({ revision: 1 })
    expect(spring.stores).toHaveLength(1)
    expect(spring.stores[0].body.text).toBe('for the named version')
    expect(await (await call(port, '/internal/nodes/not-open/flush')).json()).toEqual({ revision: null })
  })

  it('sweepClosesOldConnections', async () => {
    const port = await start(fakeSpring(), { maxAgeMs: 150, sweepMs: 50 })
    const c = await join(port)
    await until(() => c.closes.includes(4403), 2000)
  })
})
