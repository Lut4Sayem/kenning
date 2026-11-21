// Live editing: one HocuspocusProvider per open page joins the page's session on the collaboration service.
// The service is the only writer of page content; this tab keeps its local copy until the service confirms it
// (autosave.ts). A ticket from Spring is fetched on every (re)connect, so access changes take effect there.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { ApiError } from '../api/client'
import { getTicket } from '../api/collab'

/**
 * restored = the page was restored since this copy was loaded; gone = no access any more (or the page is gone);
 * too-large = the page reached its size limit (read-only for everyone); too-many = the page or this user is at the
 * connection limit.
 */
export type CollabProblem = 'restored' | 'gone' | 'too-large' | 'too-many'

export const TOO_LARGE = 'This page reached its size limit. Move some sections into sub-pages.'
export const TOO_MANY = 'Too many people on this page right now.'
export const NEAR_LIMIT = 'This page is almost at its size limit. Move some sections into sub-pages.'

export interface Collab {
  /** undefined while starting, null when this copy does not join the live session. */
  provider: HocuspocusProvider | null | undefined
  /** From the latest ticket; null until the first one. */
  access: 'EDIT' | 'VIEW' | null
  problem: CollabProblem | null
  /** The server's reason when access is gone (e.g. "This page is in the trash"). */
  message: string | null
  /** At 90 % of the size limit (until it shrinks below 85 %). */
  nearLimit: boolean
}

export const CLOSE_RESTORED = 4409
export const CLOSE_TOO_MANY = 4429
const RETRY_TOO_MANY_MS = 30_000

export const collabUrl = () =>
  import.meta.env.VITE_COLLAB_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`

interface AwarenessLike {
  setLocalStateField(field: string, value: unknown): void
}

/** Viewers send no cursor; editors send at most one cursor move per `ms` (the latest one always goes out). */
export function guardCursor(awareness: AwarenessLike, isViewer: () => boolean, ms = 100) {
  const set = awareness.setLocalStateField.bind(awareness)
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: unknown
  awareness.setLocalStateField = (field, value) => {
    if (field !== 'cursor') return set(field, value)
    clearTimeout(timer)
    if (isViewer()) return set('cursor', null)
    const wait = last + ms - Date.now()
    if (wait <= 0) {
      last = Date.now()
      return set('cursor', value)
    }
    pending = value
    timer = setTimeout(() => {
      last = Date.now()
      set('cursor', pending)
    }, wait)
  }
}

export function useCollab(nodeId: string, ydoc: Y.Doc, userId: string, enabled: boolean, epoch: number): Collab {
  const [provider, setProvider] = useState<HocuspocusProvider | null | undefined>(enabled ? undefined : null)
  const [access, setAccess] = useState<Collab['access']>(null)
  const [problem, setProblem] = useState<CollabProblem | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [nearLimit, setNearLimit] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setProvider(null)
      return
    }
    let viewer = false
    let retry: ReturnType<typeof setTimeout> | undefined
    // at the limit: stop knocking, try once more a little later
    const tooMany = () => {
      setProblem('too-many')
      p.disconnect()
      clearTimeout(retry)
      retry = setTimeout(() => {
        setProblem(null)
        void p.connect()
      }, RETRY_TOO_MANY_MS)
    }
    const p: HocuspocusProvider = new HocuspocusProvider({
      url: collabUrl(),
      name: nodeId,
      document: ydoc,
      token: async () => {
        let t
        try {
          t = await getTicket(nodeId)
        } catch (e) {
          if (e instanceof ApiError && [401, 403, 404, 410].includes(e.status)) {
            setProblem('gone')
            setMessage(e.message)
          }
          throw e
        }
        // Restored since this copy was loaded: syncing it would bring back what the restore removed (D6).
        if (t.epoch !== epoch) {
          setProblem('restored')
          throw new Error('restored')
        }
        viewer = t.access !== 'EDIT'
        setAccess(t.access)
        p.awareness?.setLocalStateField('kf', { userId, viewer })
        return t.ticket
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === 'restored') setProblem('restored')
        if (reason === 'too-many') tooMany()
        // a ticket from just before an access change, or the page is being replaced: come back with a fresh one
        if (reason === 'stale-ticket' || reason === 'busy') {
          p.disconnect()
          clearTimeout(retry)
          retry = setTimeout(() => void p.connect(), 500)
        }
      },
      onClose: ({ event }) => {
        if (event.code === CLOSE_RESTORED) setProblem('restored')
        if (event.code === CLOSE_TOO_MANY) tooMany()
      },
      onStateless: ({ payload }) => {
        let m: { type?: string; near?: boolean }
        try {
          m = JSON.parse(payload)
        } catch {
          return
        }
        if (m.type === 'too-large') setProblem('too-large')
        if (m.type === 'size') setNearLimit(!!m.near)
      },
    })
    if (p.awareness) guardCursor(p.awareness, () => viewer)
    setProvider(p)
    return () => {
      clearTimeout(retry)
      p.destroy()
    }
  }, [nodeId, ydoc, userId, enabled, epoch])

  return { provider, access, problem, message, nearLimit }
}
