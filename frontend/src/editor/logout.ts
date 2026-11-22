// Logging out must not strand unsaved work, and must not leave it on a shared computer either:
// first every local copy of this user is sent through the live session (same rules as opening a page), and only
// what the collaboration service confirmed it stored is cleared. If something could not be sent, the user decides.
import * as Y from 'yjs'
import { api, ApiError } from '../api/client'
import { getContent, saveRecovered } from '../api/content'
import { covers, needOf } from './autosave'
import { fromBase64 } from './base64'
import { confirmDialog } from '../ui/ConfirmDialog'
import { clearPendingOf, pendingFor, pendingPages, type PendingStore } from './pendingStore'
import { EMPTY_PAGE_STATE } from './schema'
import { pushDoc } from './pushCopy'
import { isHeld } from './slotLock'

/** Spring's 404 for a page that does not exist (any more): purged, or never visible to this user. */
const PURGED = 'Page not found'

/** Sends one page's local copies. true = nothing of it is left unsent. */
async function sendPage(nodeId: string, store: PendingStore, skipLive: boolean): Promise<boolean> {
  try {
    const server = await getContent(nodeId)
    const stored = new Y.Doc()
    Y.applyUpdate(stored, fromBase64(server.state || EMPTY_PAGE_STATE))
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(stored))
    const sameEpoch: string[] = []
    for (const [slot, copy] of Object.entries(await store.all())) {
      if (skipLive && (await isHeld(`${store.key}.${slot}`))) continue // an open editor sends its own copy
      if (copy.state === server.state) {
        await store.clear(slot) // the server already has exactly this
      } else if (copy.epoch !== server.contentEpoch) {
        // From before a restore: never merged, kept as a private version (D6 epoch rule).
        await saveRecovered(nodeId, { state: copy.state, text: copy.text, baseEpoch: copy.epoch })
        await store.clear(slot)
      } else {
        Y.applyUpdate(doc, fromBase64(copy.state))
        sameEpoch.push(slot)
      }
    }
    if (!sameEpoch.length) return true
    // Everything in the copies is stored already (only the bytes differed): nothing to send.
    if (!covers(Y.snapshot(stored), needOf(doc)) && !(await pushDoc(nodeId, doc, server.contentEpoch))) return false
    for (const slot of sameEpoch) await store.clear(slot)
    return true
  } catch (e) {
    // Purged, or this user cannot read the page any more: the copy can never be sent. A page in the trash keeps it
    // (it is sent if the page is restored); offline, refused or unreadable: it stays on the device too.
    if (e instanceof ApiError && (e.status === 403 || (e.status === 404 && e.message === PURGED))) {
      for (const slot of Object.keys(await store.all())) {
        if (!(await isHeld(`${store.key}.${slot}`))) await store.clear(slot) // an open editor decides for its own copy
      }
      return true
    }
    return false
  }
}

/**
 * Tries to send every local copy of this user. Returns on how many pages something is still unsent.
 * `skipLive`: leave copies that an editor open in some tab still owns (it sends them itself).
 */
export async function sendAllPending(userId: string, { skipLive = false } = {}): Promise<number> {
  const { nodes, unreadable } = await pendingPages(userId)
  const unsent = new Set(unreadable) // quarantined copies cannot be sent at all
  for (const nodeId of nodes) if (!(await sendPage(nodeId, pendingFor(userId, nodeId), skipLive))) unsent.add(nodeId)
  return unsent.size
}

/** false = the user chose to stay logged in. */
/** `next` = a same-origin path to return to after the next login (the join link, for "Not you?"). */
export async function logOut(userId: string, next?: string): Promise<boolean> {
  const unsent = await sendAllPending(userId)
  if (unsent > 0) {
    const leave = await confirmDialog({
      title: 'Log out anyway?',
      body: `You have unsaved changes on ${unsent} page${unsent === 1 ? '' : 's'} that could not be sent to the server. If you log out now, they are lost.`,
      confirmLabel: 'Log out anyway',
      cancelLabel: 'Stay logged in',
      danger: true,
    })
    if (!leave) return false
  }
  await clearPendingOf(userId)
  try {
    await api('/logout', { method: 'POST', redirectOn401: false })
  } catch {
    // go to the login page anyway
  }
  location.replace('/app/login' + (next ? '?next=' + encodeURIComponent(next) : ''))
  return true
}
