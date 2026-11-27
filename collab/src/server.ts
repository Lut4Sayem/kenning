import { Server, type Document } from '@hocuspocus/server'
import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import * as Y from 'yjs'
import type { Config } from './config.js'
import { extractBoardText } from './board/extractBoardText.js'
import { EMPTY_BOARD_STATE } from './board/format.js'
import { guardBoard } from './board/guard.js'
import { extractText } from './extractText.js'
import { log } from './log.js'
import { EpochError, RefusedError, RevisionError, TooLargeError, type Loaded, type SpringApi } from './spring.js'
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
  format: Loaded['format']
  revision: number
  epoch: number
  authors: Set<string>
  /** Restored or refused: never stored again, unloaded as soon as possible. */
  dropped: boolean
  /** Changed since the last store started (a state vector does not move on deletions, so it cannot tell). */
  changed: boolean
  /** Upper bound of the doc's size: the last stored size plus every update since, so the cap holds between stores. */
  bytes: number
  /** Stores run one after another (debounced store, flush, merge after a conflict). */
  chain: Promise<void>
  /** At the size limit: everyone is read-only from now on (copying text out still works). */
  tooLarge: boolean
  /** The store after reaching the limit is done: edits a client sees no `saved` for were refused. */
  settled: boolean
  /** At 90 % of the limit (cleared below 85 %): clients show a warning. */
  near: boolean
  /** Snapshot (base64) of the last store, sent with the final size-limit message. */
  snap: string | null
}

export interface Options {
  debounce: number
  maxDebounce: number
  backoff: number[]
  /** A connection older than this is closed, so the client comes back with a fresh ticket. */
  maxAgeMs: number
  sweepMs: number
  /** Live size limit. Below Spring's 4 MB cap, so what was typed before the page turned read-only can still be stored. */
  maxStateBytes: number
  maxPerPage: number
  maxPerUser: number
  /** Messages a connection may send in a burst, refilled at the same rate per second. */
  burst: number
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
  maxStateBytes: 3_800_000,
  maxPerPage: 25,
  maxPerUser: 10,
  burst: 50,
}

export const MAX_TEXT = 1_000_000 // Spring's cap on the search text

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
  const socketsOf = new Map<string, Set<string>>() // userId -> socket ids
  const buckets = new Map<string, { tokens: number; at: number }>() // socket id -> rate limit
  // When Spring last said access changed, per page ("n:id") and per user ("u:id"). A ticket issued before that
  // (they live 60 s) must not open a socket: the client fetches a fresh one, which tells the truth.
  const revoked = new Map<string, number>()
  const revoke = (key: string) => {
    const at = Date.now()
    revoked.set(key, at)
    setTimeout(() => revoked.get(key) === at && revoked.delete(key), 120_000).unref()
  }

  /** Past the size limit: nobody can add more; tell every client. */
  function readOnlyForEveryone(doc: Document, meta: Meta) {
    if (meta.tooLarge) return
    log('too-large', { nodeId: doc.name })
    meta.tooLarge = true
    for (const conn of doc.getConnections()) conn.readOnly = true
    doc.broadcastStateless(JSON.stringify({ type: 'too-large' }))
    // store what came in before the limit, then say so: a client's edits not covered by a `saved` were refused
    void serial(doc, meta).then(() => {
      meta.settled = true
      doc.broadcastStateless(JSON.stringify({ type: 'too-large', final: true, snap: meta.snap }))
    })
  }

  /** Warns at 90 % of the limit, clears below 85 % (so it does not flicker around one size). */
  function checkSize(doc: Document, meta: Meta) {
    const near = meta.bytes >= o.maxStateBytes * 0.9 || (meta.near && meta.bytes >= o.maxStateBytes * 0.85)
    if (near === meta.near) return
    meta.near = near
    doc.broadcastStateless(JSON.stringify({ type: 'size', near }))
  }

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
    if (server.hocuspocus.debouncer.isDebounced(key)) await server.hocuspocus.debouncer.executeNow(key) // a no-op store: dropped
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
    if (meta.changed) await serial(doc, meta)
    else await meta.chain
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
      revoke(`n:${name}`) // a ticket from before the restore must not join while the old doc unloads
      const doc = server.hocuspocus.documents.get(name)
      if (doc) await drop(doc, CLOSE.restored, 'restored')
      log('reset', { nodeId: name })
      return [204, null]
    }
    if (req.method === 'POST' && req.url === '/internal/revalidate') {
      const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds.map(String) : []
      const userId = typeof body.userId === 'string' ? body.userId : null
      nodeIds.forEach((id: string) => revoke(`n:${id}`))
      if (userId) revoke(`u:${userId}`)
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

  const serial = (doc: Document, meta: Meta) => (meta.chain = meta.chain.then(() => store(doc, meta)))

  /** Stores until it works (doc stays loaded meanwhile), except when Spring says the page was restored. */
  async function store(doc: Document, meta: Meta) {
    for (let attempt = 0; !meta.dropped && meta.changed; attempt++) {
      meta.changed = false
      const authors = [...meta.authors]
      meta.authors.clear()
      // what was stored, deletions included: a client clears its local copy only when this holds all of its edits
      const snap = b64(Y.encodeSnapshot(Y.snapshot(doc)))
      const state = Y.encodeStateAsUpdate(doc)
      const text = meta.format === 'YJS_BOARD_V1' ? extractBoardText(doc) : extractText(doc.getXmlFragment(FRAGMENT))
      if (state.length > o.maxStateBytes || text.length > MAX_TEXT) readOnlyForEveryone(doc, meta)
      const body = { baseRevision: meta.revision, baseEpoch: meta.epoch, state: b64(state), text, authors }
      try {
        const { revision } = await spring.store(doc.name, body)
        meta.revision = revision
        meta.bytes = state.length
        meta.snap = snap
        checkSize(doc, meta)
        doc.broadcastStateless(JSON.stringify({ type: 'saved', revision, snap }))
        log('store', { nodeId: doc.name, revision, authors: authors.length })
        return
      } catch (e) {
        authors.forEach((a) => meta.authors.add(a))
        meta.changed = true
        if (e instanceof RefusedError) {
          // deleted, locked, an author lost access: clients come back with a fresh ticket, which tells them why
          log('store-refused', { nodeId: doc.name, error: e.message })
          await drop(doc, CLOSE.accessChanged, 'access-changed')
          return
        }
        if (e instanceof TooLargeError) {
          // Spring can take no more of this page: nothing more is stored, and clients are told their edits were not
          meta.changed = false
          readOnlyForEveryone(doc, meta)
          return
        }
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
    // One message. A reconnect's sync carries all unsent edits at once, so anything that could still be stored must
    // fit (Spring takes 4 MB); a bigger one is closed with 1009 and the client stops instead of resending it.
    websocketOptions: { maxPayload: 8 * 1024 * 1024 },

    async onAuthenticate({ token, documentName, requestHeaders, connectionConfig }) {
      if (requestHeaders.get('origin') !== config.appOrigin) throw deny('bad-origin')
      let t
      try {
        t = verifyTicket(token, config.secret, Date.now())
      } catch (e) {
        throw deny((e as Error).message)
      }
      if (t.nodeId !== documentName) throw deny('bad-ticket')
      if (t.iat <= (revoked.get(`n:${t.nodeId}`) ?? -1) || t.iat <= (revoked.get(`u:${t.userId}`) ?? -1)) throw deny('stale-ticket')
      const open = server.hocuspocus.documents.get(documentName)
      if ((open?.getConnectionsCount() ?? 0) >= o.maxPerPage || (socketsOf.get(t.userId)?.size ?? 0) >= o.maxPerUser) {
        log('too-many', { nodeId: documentName, userId: t.userId })
        throw deny('too-many')
      }
      // A newer ticket than the open doc: Spring restored the page and the reset never arrived. Drop the old doc.
      const meta = metas.get(documentName)
      const doc = server.hocuspocus.documents.get(documentName)
      if (meta && doc && !meta.dropped && t.epoch > meta.epoch) {
        prefetched.delete(documentName)
        void drop(doc, CLOSE.restored, 'restored')
      }
      // A restored page may still be unloading: wait for it, then compare epochs on fresh content.
      for (let i = 0; i < 50 && metas.get(documentName)?.dropped; i++) await sleep(50)
      if (metas.get(documentName)?.dropped) throw deny('busy') // the provider comes back with a fresh ticket
      const epoch = metas.get(documentName)?.epoch ?? (await prefetch(documentName)).epoch
      // A client from before a restore must not sync its old copy into the restored page (D6).
      if (epoch !== t.epoch) throw deny('restored')
      // VIEW: the server drops their document updates; awareness still works so they show in the avatar stack
      connectionConfig.readOnly = t.access !== 'EDIT' || !!metas.get(documentName)?.tooLarge
      return { userId: t.userId, name: t.name, access: t.access, epoch: t.epoch, connectedAt: Date.now() }
    },

    async onLoadDocument({ documentName, document }) {
      const loaded = await prefetch(documentName)
      prefetched.delete(documentName)
      const board = loaded.format === 'YJS_BOARD_V1'
      Y.applyUpdate(document, loaded.state ?? Buffer.from(board ? EMPTY_BOARD_STATE : EMPTY_PAGE_STATE, 'base64'), 'spring')
      if (board) guardBoard(document, documentName)
      const bytes = Y.encodeStateAsUpdate(document).length
      metas.set(documentName, { format: loaded.format, revision: loaded.revision, epoch: loaded.epoch, authors: new Set(), dropped: false, changed: false, bytes, chain: Promise.resolve(), tooLarge: false, settled: false, near: bytes >= o.maxStateBytes * 0.9, snap: null })
    },

    async onChange({ documentName, document, context, update }) {
      const meta = metas.get(documentName)
      if (!meta) return
      meta.changed = true
      meta.bytes += update.length
      if (context?.userId && context.access === 'EDIT') meta.authors.add(context.userId)
      // checked on every change, not only when storing: one fast client must not grow a page past the cap for 10 s
      // the estimate counts moved or re-typed content twice: measure before it turns anything on
      if (!meta.tooLarge && (meta.bytes > o.maxStateBytes || (!meta.near && meta.bytes >= o.maxStateBytes * 0.9))) {
        meta.bytes = Y.encodeStateAsUpdate(document).length
      }
      if (meta.bytes > o.maxStateBytes) readOnlyForEveryone(document, meta)
      else checkSize(document, meta)
    },

    async onStoreDocument({ documentName, document }) {
      const meta = metas.get(documentName)
      if (meta && !meta.dropped && meta.changed) await serial(document, meta)
    },

    async afterUnloadDocument({ documentName }) {
      metas.delete(documentName)
    },

    async connected({ documentName, context, connection, socketId }) {
      socketsOf.set(context.userId, (socketsOf.get(context.userId) ?? new Set()).add(socketId))
      const meta = metas.get(documentName)
      if (meta?.tooLarge) connection.sendStateless(JSON.stringify({ type: 'too-large' }))
      if (meta?.settled) connection.sendStateless(JSON.stringify({ type: 'too-large', final: true, snap: meta.snap }))
      else if (meta?.near) connection.sendStateless(JSON.stringify({ type: 'size', near: true }))
      log('connect', { nodeId: documentName, userId: context.userId, access: context.access })
    },

    async onDisconnect({ documentName, context, socketId }) {
      const mine = context?.userId ? socketsOf.get(context.userId) : undefined
      mine?.delete(socketId)
      if (mine?.size === 0) socketsOf.delete(context.userId)
      buckets.delete(socketId)
      log('disconnect', { nodeId: documentName, userId: context?.userId })
    },

    // A runaway client (a bug, a script) must not flood the page for everyone: a token bucket per connection.
    async beforeHandleMessage({ connection, socketId, documentName, context }) {
      // D6 at the message level: nothing from a connection of another epoch (or to a dropped doc) is applied
      const meta = metas.get(documentName)
      if (meta && (meta.dropped || context?.epoch !== meta.epoch)) {
        connection.webSocket.close(CLOSE.restored, 'restored')
        throw { code: CLOSE.restored, reason: 'restored' }
      }
      const now = Date.now()
      const b = buckets.get(socketId) ?? { tokens: o.burst, at: now }
      b.tokens = Math.min(o.burst, b.tokens + ((now - b.at) / 1000) * o.burst)
      b.at = now
      buckets.set(socketId, b)
      if (b.tokens < 1) {
        log('rate-limit', { socketId })
        connection.webSocket.close(CLOSE.tooMany, 'too-many')
        throw { code: CLOSE.tooMany, reason: 'too-many' }
      }
      b.tokens -= 1
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
