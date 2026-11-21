import { Server, type Document } from '@hocuspocus/server'
import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
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
  /** A connection older than this is closed, so the client comes back with a fresh ticket. */
  maxAgeMs: number
  sweepMs: number
}

export const FRAGMENT = 'document-store'
// Same bytes as EMPTY_PAGE_STATE in frontend/src/editor/schema.ts: every copy of a page must share this root (D6).
export const EMPTY_PAGE_STATE =
  'AQcBAAcBDmRvY3VtZW50LXN0b3JlAwpibG9ja0dyb3VwBwABAAMOYmxvY2tDb250YWluZXIHAAEBAwlwYXJhZ3JhcGgoAAECD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1bHQoAAECCXRleHRDb2xvcgF3B2RlZmF1bHQoAAECDXRleHRBbGlnbm1lbnQBdwRsZWZ0KAABAQJpZAF3C2ZpcnN0LWJsb2NrAA=='

export const CLOSE = { accessChanged: 4403, restored: 4409, tooMany: 4429 } as const

const DEFAULTS: Options = {
  debounce: 2000,
  maxDebounce: 10_000,
  backoff: [1000, 2000, 5000, 10_000, 30_000],
  maxAgeMs: 30 * 60_000,
  sweepMs: 60_000,
}

/** Rejects a connection; the provider gets onAuthenticationFailed({reason}). */
const deny = (reason: string) => ({ reason })
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sameSecret(header: string | string[] | undefined, secret: string) {
  if (typeof header !== 'string') return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
  } catch {
    return {}
  }
}

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

  /** Stores now if anything is waiting (or being) stored; resolves when the page is stored. */
  async function flush(name: string) {
    const doc = server.hocuspocus.documents.get(name)
    const meta = metas.get(name)
    if (!doc || !meta || meta.dropped) return null
    const key = `onStoreDocument-${name}`
    const { debouncer } = server.hocuspocus
    if (debouncer.isDebounced(key)) await debouncer.executeNow(key)
    while (debouncer.isCurrentlyExecuting(key)) await sleep(20)
    if (meta.sv !== b64(Y.encodeStateVector(doc))) await store(doc, meta)
    return meta.revision
  }

  /** Spring's calls: reset after a restore, revalidate after access changes, flush before a version. */
  async function internal(req: IncomingMessage): Promise<[number, unknown]> {
    if (!sameSecret(req.headers['x-collab-secret'], config.secret)) return [403, { message: 'Forbidden' }]
    const body = await readJson(req)
    const node = /^\/internal\/nodes\/([^/]+)\/(reset|flush)$/.exec(req.url ?? '')
    if (req.method === 'POST' && node) {
      const name = decodeURIComponent(node[1])
      if (node[2] === 'flush') return [200, { revision: await flush(name) }]
      prefetched.delete(name)
      const doc = server.hocuspocus.documents.get(name)
      if (doc) await drop(doc, CLOSE.restored, 'restored')
      log('reset', { nodeId: name })
      return [204, null]
    }
    if (req.method === 'POST' && req.url === '/internal/revalidate') {
      const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds.map(String) : []
      const userId = typeof body.userId === 'string' ? body.userId : null
      for (const id of nodeIds) {
        const doc = server.hocuspocus.documents.get(id)
        if (doc) closeAll(doc, CLOSE.accessChanged, 'access-changed')
      }
      if (userId) for (const doc of server.hocuspocus.documents.values()) closeAll(doc, CLOSE.accessChanged, 'access-changed', (c) => c?.userId === userId)
      log('revalidate', { nodes: nodeIds.length, userId })
      return [204, null]
    }
    return [404, { message: 'Not found' }]
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
      if (request.url?.startsWith('/internal/')) {
        const [status, body] = await internal(request)
        response.writeHead(status, { 'Content-Type': 'application/json' }).end(body === null ? undefined : JSON.stringify(body))
        throw null
      }
    },

    async onDestroy() {
      clearInterval(sweep)
    },
  })

  // Safety net for anything Spring could not tell us: every connection gets a fresh ticket at least every 30 minutes.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - o.maxAgeMs
    for (const doc of server.hocuspocus.documents.values()) closeAll(doc, CLOSE.accessChanged, 'refresh', (c) => c?.connectedAt < cutoff)
  }, o.sweepMs)
  sweep.unref()
  return server
}
