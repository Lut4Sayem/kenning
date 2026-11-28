import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/server.js'
import { connect, fakeSpring, ticket, testConfig, until, type Client } from './helpers.js'

let server: ReturnType<typeof createServer>
let port: number
const clients: Client[] = []
const open = (userId: string, access: 'EDIT' | 'VIEW' = 'EDIT') => {
  const c = connect(port, 'n1', ticket({ userId, access }))
  clients.push(c)
  return c
}
const summons = (c: Client) => c.messages.filter((m) => m.type === 'summon')
const settle = () => new Promise((r) => setTimeout(r, 200))

beforeEach(async () => {
  server = createServer(testConfig(), fakeSpring({ format: 'YJS_BOARD_V1' }))
  await server.listen()
  port = server.address.port
})
afterEach(async () => {
  clients.splice(0).forEach((c) => c.provider.destroy())
  await server.destroy()
})

describe('stateless relay', () => {
  it('summonRelayedToOthers', async () => {
    const [a, b, c] = [open('u1'), open('u2'), open('u3', 'VIEW')]
    await Promise.all([a.synced, b.synced, c.synced])
    a.provider.sendStateless(JSON.stringify({ type: 'summon', userId: 'someone-else' }))
    await until(() => summons(b).length === 1 && summons(c).length === 1)
    expect(summons(b)[0]).toEqual({ type: 'summon', userId: 'u1' }) // who sent it, as authenticated
    await settle()
    expect(summons(a)).toEqual([])
  })

  it('summonRateLimited', async () => {
    const [a, b] = [open('u1'), open('u2')]
    await Promise.all([a.synced, b.synced])
    a.provider.sendStateless(JSON.stringify({ type: 'summon' }))
    a.provider.sendStateless(JSON.stringify({ type: 'summon' }))
    await until(() => summons(b).length === 1)
    await settle()
    expect(summons(b)).toHaveLength(1)
  })

  it('viewerCannotSummon', async () => {
    const [a, v] = [open('u1'), open('u2', 'VIEW')]
    await Promise.all([a.synced, v.synced])
    v.provider.sendStateless(JSON.stringify({ type: 'summon' }))
    await settle()
    expect(summons(a)).toEqual([])
  })

  it('unknownStatelessDropped', async () => {
    const [a, b] = [open('u1'), open('u2')]
    await Promise.all([a.synced, b.synced])
    a.provider.sendStateless(JSON.stringify({ type: 'saved', revision: 99 }))
    a.provider.sendStateless('not json')
    a.provider.sendStateless(JSON.stringify({ type: 'summon' })) // still allowed: the dropped ones did not count
    await until(() => summons(b).length === 1)
    await settle()
    expect(b.messages.filter((m) => m.type !== 'summon')).toEqual([])
  })
})
