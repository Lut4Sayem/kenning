// Live editing: one HocuspocusProvider per open page joins the page's session on the collaboration service.
// The service is the only writer of page content; this tab keeps its local copy until the service confirms it
// (autosave.ts). A ticket from Spring is fetched on every (re)connect, so access changes take effect there.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { ApiError } from '../api/client'
import { getTicket } from '../api/collab'

/** restored = the page was restored since this copy was loaded; gone = no access any more (or the page is gone). */
export type CollabProblem = 'restored' | 'gone'

export interface Collab {
  /** undefined while starting, null when this copy does not join the live session. */
  provider: HocuspocusProvider | null | undefined
  /** From the latest ticket; null until the first one. */
  access: 'EDIT' | 'VIEW' | null
  problem: CollabProblem | null
  /** The server's reason when access is gone (e.g. "This page is in the trash"). */
  message: string | null
}

export const CLOSE_RESTORED = 4409

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

  useEffect(() => {
    if (!enabled) {
      setProvider(null)
      return
    }
    let viewer = false
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
      },
      onClose: ({ event }) => {
        if (event.code === CLOSE_RESTORED) setProblem('restored')
      },
    })
    if (p.awareness) guardCursor(p.awareness, () => viewer)
    setProvider(p)
    return () => p.destroy()
  }, [nodeId, ydoc, userId, enabled, epoch])

  return { provider, access, problem, message }
}
