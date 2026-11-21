import { Server, type Document } from '@hocuspocus/server'
import * as Y from 'yjs'
import type { Config } from './config.js'
import { extractText } from './extractText.js'
import { log } from './log.js'
import { EpochError, RevisionError, type Loaded, type SpringApi } from './spring.js'
import { verifyTicket } from './ticket.js'

export interface Ctx {
  userId: string
  name: string
  access: 'EDIT' | 'VIEW'
  epoch: number
  connectedAt: number
}

/** Per open page: what Spring has, who edited since the last store. */
interface Meta {
  revision: number
  epoch: number
  authors: Set<string>
  /** Restored or refused: never stored again, unloaded as soon as possible. */
  dropped: boolean
  /** State vector (base64) Spring has: nothing to store while the doc still matches it. */
  sv: string
}

export interface Options {
  debounce: number
  maxDebounce: number
  backoff: number[]
}

export const FRAGMENT = 'document-store'
// Same bytes as EMPTY_PAGE_STATE in frontend/src/editor/schema.ts: every copy of a page must share this root (D6).
export const EMPTY_PAGE_STATE =
  'AQcBAAcBDmRvY3VtZW50LXN0b3JlAwpibG9ja0dyb3VwBwABAAMOYmxvY2tDb250YWluZXIHAAEBAwlwYXJhZ3JhcGgoAAECD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1bHQoAAECCXRleHRDb2xvcgF3B2RlZmF1bHQoAAECDXRleHRBbGlnbm1lbnQBdwRsZWZ0KAABAQJpZAF3C2ZpcnN0LWJsb2NrAA=='

export const CLOSE = { accessChanged: 4403, restored: 4409, tooMany: 4429 } as const

const DEFAULTS: Options = { debounce: 2000, maxDebounce: 10_000, backoff: [1000, 2000, 5000, 10_000, 30_000] }

/** Rejects a connection; the provider gets onAuthenticationFailed({reason}). */
const deny = (reason: string) => ({ reason })
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Closes the whole socket (one provider = one socket = one page), so the client sees the code. */
export function closeAll(doc: Document, code: number, reason: string, only?: (ctx: Ctx) => boolean) {
  for (const conn of doc.getConnections()) {
    if (!only || only(conn.context as Ctx)) conn.webSocket.close(code, reason)
  }
}

export function createServer(config: Config, spring: SpringApi, opts: Partial<Options> = {}) {
  const o = { ...DEFAULTS, ...opts }
  const metas = new Map<string, Meta>()
  // Content read while authenticating a page that is not open yet, reused by onLoadDocument (one read, not two).
  const prefetched = new Map<string, Promise<Loaded>>()

  const prefetch = (name: string) => {
    let p = prefetched.get(name)
    if (!p) {
      p = spring.load(name)
      prefetched.set(name, p)
      p.catch(() => {})
      setTimeout(() => prefetched.get(name) === p && prefetched.delete(name), 10_000).unref()
    }
    return p
  }

  async function drop(doc: Document, code: number, reason: string) {
    const meta = metas.get(doc.name)
    if (meta) meta.dropped = true
    closeAll(doc, code, reason)
    const key = `onStoreDocument-${doc.name}`
    if (server.hocuspocus.debouncer.isDebounced(key)) server.hocuspocus.debouncer.executeNow(key) // a no-op store: dropped
    await server.hocuspocus.unloadDocument(doc)
  }

  /** Stores until it works (doc stays loaded meanwhile), except when Spring says the page was restored. */
  async function store(doc: Document, meta: Meta) {
    for (let attempt = 0; !meta.dropped; attempt++) {
      const authors = [...meta.authors]
      meta.authors.clear()
      const sv = Y.encodeStateVector(doc)
      const body = {
        baseRevision: meta.revision,
        baseEpoch: meta.epoch,
        state: b64(Y.encodeStateAsUpdate(doc)),
        text: extractText(doc.getXmlFragment(FRAGMENT)),
        authors,
      }
      try {
        const { revision } = await spring.store(doc.name, body)
        meta.revision = revision
        meta.sv = b64(sv)
        // sv tells each client whether ALL of its edits are in what was stored (then it may clear its local copy)
        doc.broadcastStateless(JSON.stringify({ type: 'saved', revision, sv: b64(sv) }))
        log('store', { nodeId: doc.name, revision, authors: authors.length })
        return
      } catch (e) {
        authors.forEach((a) => meta.authors.add(a))
        if (e instanceof EpochError) {
          log('store-epoch', { nodeId: doc.name })
          await drop(doc, CLOSE.restored, 'restored')
          return
        }
        if (e instanceof RevisionError) {
          const latest = await spring.load(doc.name).catch(() => null)
          if (latest && latest.epoch !== meta.epoch) {
            await drop(doc, CLOSE.restored, 'restored')
            return
          }
          if (latest) {
            if (latest.state) Y.applyUpdate(doc, latest.state, 'spring') // same lineage: merges without loss
            meta.revision = latest.revision
            continue
          }
        }
        log('store-error', { nodeId: doc.name, attempt, error: (e as Error).message })
        doc.broadcastStateless(JSON.stringify({ type: 'retrying' }))
        await sleep(o.backoff[Math.min(attempt, o.backoff.length - 1)])
      }
    }
  }

  const server: Server<Ctx> = new Server<Ctx>({
    port: config.port,
    quiet: true,
    stopOnSignals: true,
    debounce: o.debounce,
    maxDebounce: o.maxDebounce,

    async onAuthenticate({ token, documentName, requestHeaders, connectionConfig }) {
      if (requestHeaders.get('origin') !== config.appOrigin) throw deny('bad-origin')
      let t
      try {
        t = verifyTicket(token, config.secret, Date.now())
      } catch (e) {
        throw deny((e as Error).message)
      }
      if (t.nodeId !== documentName) throw deny('bad-ticket')
      // A restored page may still be unloading: wait for it, then compare epochs on fresh content.
      for (let i = 0; i < 50 && metas.get(documentName)?.dropped; i++) await sleep(50)
      const epoch = metas.get(documentName)?.epoch ?? (await prefetch(documentName)).epoch
      // A client from before a restore must not sync its old copy into the restored page (D6).
      if (epoch !== t.epoch) throw deny('restored')
      // VIEW: the server drops their document updates; awareness still works so they show in the avatar stack
      connectionConfig.readOnly = t.access !== 'EDIT'
      return { userId: t.userId, name: t.name, access: t.access, epoch: t.epoch, connectedAt: Date.now() }
    },

    async onLoadDocument({ documentName, document }) {
      const loaded = await prefetch(documentName)
      prefetched.delete(documentName)
      Y.applyUpdate(document, loaded.state ?? Buffer.from(EMPTY_PAGE_STATE, 'base64'), 'spring')
      const sv = b64(Y.encodeStateVector(document))
      metas.set(documentName, { revision: loaded.revision, epoch: loaded.epoch, authors: new Set(), dropped: false, sv })
    },

    async onChange({ documentName, context }) {
      if (context?.userId && context.access === 'EDIT') metas.get(documentName)?.authors.add(context.userId)
    },

    async onStoreDocument({ documentName, document }) {
      const meta = metas.get(documentName)
      if (meta && !meta.dropped && meta.sv !== b64(Y.encodeStateVector(document))) await store(document, meta)
    },

    async afterUnloadDocument({ documentName }) {
      metas.delete(documentName)
    },

    async connected({ documentName, context }) {
      log('connect', { nodeId: documentName, userId: context.userId, access: context.access })
    },

    async onDisconnect({ documentName, context }) {
      log('disconnect', { nodeId: documentName, userId: context?.userId })
    },

    async onRequest({ request, response }) {
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"UP"}')
        throw null // handled: skip the default response
      }
    },
  })
  return server
}
