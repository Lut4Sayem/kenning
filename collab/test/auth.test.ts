import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/server.js'
import { connect, ticket, testConfig, until, type Client } from './helpers.js'

let server: ReturnType<typeof createServer>
let port: number
const clients: Client[] = []
const open = (...a: Parameters<typeof connect>) => {
  const c = connect(...a)
  clients.push(c)
  return c
}

beforeEach(async () => {
  server = createServer(testConfig())
  await server.listen()
  port = server.address.port
})
afterEach(async () => {
  clients.splice(0).forEach((c) => c.provider.destroy())
  await server.destroy()
})

describe('authentication', () => {
  it('validTicketSyncs', async () => {
    await open(port, 'n1', ticket()).synced
  })
  it('wrongNodeRejected', async () => {
    expect(await open(port, 'n2', ticket({ nodeId: 'n1' })).failed).toBe('bad-ticket')
  })
  it('expiredRejected', async () => {
    expect(await open(port, 'n1', ticket({ exp: Date.now() - 1 })).failed).toBe('expired')
  })
  it('badOriginRejected', async () => {
    expect(await open(port, 'n1', ticket(), 'http://evil.test').failed).toBe('bad-origin')
  })
  it('viewIsReadOnly', async () => {
    const editor = open(port, 'n1', ticket({ userId: 'u1' }))
    const viewer = open(port, 'n1', ticket({ userId: 'u2', access: 'VIEW' }))
    await Promise.all([editor.synced, viewer.synced])
    viewer.doc.getText('t').insert(0, 'from viewer')
    editor.doc.getText('t').insert(0, 'from editor')
    await until(() => viewer.doc.getText('t').toString().includes('from editor'))
    await new Promise((r) => setTimeout(r, 200))
    expect(editor.doc.getText('t').toString()).not.toContain('from viewer')
  })
  it('healthIsUp', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'UP' })
  })
})
