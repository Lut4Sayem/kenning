// Sends a copy kept on this device (a tab closed before it was confirmed, logout, back online) into the page's
// live session, and waits until the collaboration service says it stored all of it.
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { getTicket } from '../api/collab'
import { covers } from './autosave'
import { fromBase64 } from './base64'
import { collabUrl } from './collab'

const TIMEOUT_MS = 15_000

/** true = the service stored a state holding every edit in `doc`. Never throws. */
export function pushDoc(nodeId: string, doc: Y.Doc, epoch: number, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const need = Y.decodeStateVector(Y.encodeStateVector(doc))
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      provider.destroy()
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    const provider: HocuspocusProvider = new HocuspocusProvider({
      url: collabUrl(),
      name: nodeId,
      document: doc,
      token: async () => {
        const t = await getTicket(nodeId).catch(() => null)
        // restored meanwhile (the caller keeps it privately next time) or no longer allowed to edit: it stays here
        if (!t || t.epoch !== epoch || t.access !== 'EDIT') {
          finish(false)
          throw new Error('cannot send')
        }
        return t.ticket
      },
      onAuthenticationFailed: () => finish(false),
      onStateless: ({ payload }) => {
        try {
          const m = JSON.parse(payload) as { type?: string; sv?: string }
          if (m.type === 'saved' && m.sv && covers(Y.decodeStateVector(fromBase64(m.sv)), need)) finish(true)
        } catch {
          // not ours to read
        }
      },
    })
  })
}
