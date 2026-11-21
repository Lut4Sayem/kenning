import { api } from './client'

export interface Content {
  format: string
  state: string // base64 Yjs state, '' for a new page
  revision: number
  /** Goes up when the state was replaced wholesale (restore). Copies from another epoch must not be merged in. */
  contentEpoch: number
}

// A request that never answers would block what waits for it, so content calls give up: after 15 s, plus
// 10 s per MB sent (a 4 MB page on a slow uplink needs longer than a small one).
const TIMEOUT_MS = 15_000
const TIMEOUT_MS_PER_MB = 10_000
const bytes = (json: string) => new Blob([json]).size

function timed<T>(call: (signal: AbortSignal) => Promise<T>, bodyBytes = 0): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + (TIMEOUT_MS_PER_MB * bodyBytes) / (1024 * 1024))
  return call(controller.signal).finally(() => clearTimeout(timer))
}

export const getContent = (nodeId: string) => timed((signal) => api<Content>(`/api/nodes/${nodeId}/content`, { signal }))

/** Keeps a copy that must not be merged into the page as a version only this user can see. Safe to repeat. */
export function saveRecovered(nodeId: string, body: { state: string; text: string; baseEpoch: number }) {
  const json = JSON.stringify(body)
  return timed(
    (signal) => api<{ id: string; createdAt: string }>(`/api/nodes/${nodeId}/versions/recovered`, { method: 'POST', body: json, signal }),
    bytes(json),
  )
}
