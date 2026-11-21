import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import type { Config } from '../src/config.js'
import { sign, type Ticket } from '../src/ticket.js'

export const ORIGIN = 'http://app.test'
export const SECRET = 'test-secret'

export const testConfig = (over: Partial<Config> = {}): Config =>
  ({ port: 0, secret: SECRET, appOrigin: ORIGIN, springUrl: 'http://spring.test', ...over })

export function ticket(over: Partial<Ticket> = {}, secret = SECRET): string {
  const t: Ticket = { nodeId: 'n1', userId: 'u1', name: 'Ann', access: 'EDIT', epoch: 0, exp: Date.now() + 60_000, ...over }
  const payload = Buffer.from(JSON.stringify(t)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** A browser-like socket: sends an Origin header. */
const socketWithOrigin = (origin: string) =>
  class extends WebSocket {
    constructor(url: string) {
      super(url, { origin })
    }
  }

export interface Client {
  provider: HocuspocusProvider
  doc: Y.Doc
  failed: Promise<string>
  synced: Promise<void>
}

export function connect(port: number, name: string, token: string | (() => Promise<string>), origin = ORIGIN): Client {
  const doc = new Y.Doc()
  let fail!: (r: string) => void
  let sync!: () => void
  const failed = new Promise<string>((r) => (fail = r))
  const synced = new Promise<void>((r) => (sync = r))
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${port}/collab`,
    name,
    document: doc,
    token,
    // @ts-expect-error the option is forwarded to the socket; it is not in the provider's type
    WebSocketPolyfill: socketWithOrigin(origin),
    onAuthenticationFailed: ({ reason }) => fail(reason),
    onSynced: () => sync(),
  })
  return { provider, doc, failed, synced }
}

export const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}
