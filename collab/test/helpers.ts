import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import type { Config } from '../src/config.js'
import type { Loaded, SpringApi, StoreBody } from '../src/spring.js'
import { sign, type Ticket } from '../src/ticket.js'

export const ORIGIN = 'http://app.test'
export const SECRET = 'test-secret'

export const testConfig = (over: Partial<Config> = {}): Config =>
  ({ port: 0, secret: SECRET, appOrigin: ORIGIN, springUrl: 'http://spring.test', ...over })

export function ticket(over: Partial<Ticket> = {}, secret = SECRET): string {
  const t: Ticket = { nodeId: 'n1', userId: 'u1', name: 'Ann', access: 'EDIT', epoch: 0, iat: Date.now(), exp: Date.now() + 60_000, ...over }
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
  /** Close codes this client's socket got. */
  closes: number[]
  /** Stateless messages, parsed. */
  messages: { type: string; [k: string]: unknown }[]
}

export function connect(port: number, name: string, token: string | (() => Promise<string>), origin = ORIGIN): Client {
  const doc = new Y.Doc()
  let fail!: (r: string) => void
  let sync!: () => void
  const failed = new Promise<string>((r) => (fail = r))
  const synced = new Promise<void>((r) => (sync = r))
  const closes: number[] = []
  const messages: Client['messages'] = []
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${port}/collab`,
    name,
    document: doc,
    token,
    // @ts-expect-error the option is forwarded to the socket; it is not in the provider's type
    WebSocketPolyfill: socketWithOrigin(origin),
    onAuthenticationFailed: ({ reason }) => fail(reason),
    onSynced: () => sync(),
    onClose: ({ event }) => closes.push(event.code),
    onStateless: ({ payload }) => messages.push(JSON.parse(payload)),
  })
  return { provider, doc, failed, synced, closes, messages }
}

export const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

export interface FakeSpring extends SpringApi {
  stores: { nodeId: string; body: StoreBody; at: number }[]
  loaded: Loaded
  /** Replaces the default store (which accepts and bumps the revision). */
  storeImpl?: (body: StoreBody) => Promise<{ revision: number }>
}

export function fakeSpring(init: Partial<Loaded> = {}): FakeSpring {
  const f: FakeSpring = {
    stores: [],
    loaded: { state: null, revision: 0, epoch: 0, format: 'YJS_BLOCKNOTE_V1', ...init },
    async load() {
      return f.loaded
    },
    async store(nodeId, body) {
      f.stores.push({ nodeId, body, at: Date.now() })
      if (f.storeImpl) return f.storeImpl(body)
      f.loaded = { ...f.loaded, state: Buffer.from(body.state, 'base64'), revision: f.loaded.revision + 1 }
      return { revision: f.loaded.revision }
    },
  }
  return f
}

/** Types into the page's first paragraph the way the editor binding stores text. */
export function typeIn(doc: Y.Doc, text: string) {
  const group = doc.getXmlFragment('document-store').get(0) as Y.XmlElement
  const paragraph = (group.get(0) as Y.XmlElement).get(0) as Y.XmlElement
  paragraph.insert(paragraph.length, [new Y.XmlText(text)])
}
