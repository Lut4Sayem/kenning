// Spring's internal API: the only place page content is read from and written to (ADR 0004).
import type { Config } from './config.js'

export interface Loaded {
  state: Uint8Array | null
  revision: number
  epoch: number
}

export interface StoreBody {
  baseRevision: number
  baseEpoch: number
  state: string // base64
  text: string
  authors: string[]
}

/** The page was restored since this doc was loaded: it must never be stored (D6). */
export class EpochError extends Error {}
/** Over Spring's size caps (4 MB state, 1 MB text): retrying cannot help. */
export class TooLargeError extends Error {}
/** Spring refuses this page for good (deleted, locked, an author lost access, bad data): retrying cannot help. */
export class RefusedError extends Error {}
/** Someone else stored first (should not happen with one writer): merge the stored state and store again. */
export class RevisionError extends Error {}

export interface SpringApi {
  load(nodeId: string): Promise<Loaded>
  store(nodeId: string, body: StoreBody): Promise<{ revision: number }>
}

export function springApi(config: Config): SpringApi {
  const url = (nodeId: string) => `${config.springUrl}/internal/collab/nodes/${encodeURIComponent(nodeId)}/content`
  const headers = { 'X-Collab-Secret': config.secret, 'Content-Type': 'application/json' }
  return {
    async load(nodeId) {
      const res = await fetch(url(nodeId), { headers, signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`load failed: ${res.status}`)
      const c = (await res.json()) as { state: string; revision: number; contentEpoch: number }
      return { state: c.state ? Buffer.from(c.state, 'base64') : null, revision: c.revision, epoch: c.contentEpoch }
    },
    async store(nodeId, body) {
      const res = await fetch(url(nodeId), { method: 'PUT', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
      if (res.status === 409) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        throw b.message === 'EPOCH' ? new EpochError() : new RevisionError()
      }
      if (res.status === 413) throw new TooLargeError()
      if ([400, 403, 404, 410].includes(res.status)) throw new RefusedError(`store refused: ${res.status}`)
      if (!res.ok) throw new Error(`store failed: ${res.status}`)
      return { revision: ((await res.json()) as { revision: number }).revision }
    },
  }
}
