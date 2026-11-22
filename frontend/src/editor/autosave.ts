// No lost edits (domain spec 5.3): every change is written to IndexedDB at once and stays there until the
// collaboration service confirms it stored it; a copy the server never confirmed is picked up on the next open.
//
// Copies of a page are Yjs documents of one lineage, so a kept copy is MERGED into the live page. The exception
// is a state that was replaced wholesale (version restore): the server then has a new contentEpoch, and
// merging the old lineage into it would bring back what the restore removed. Such a copy is kept as a private
// "recovered" version instead, and the page loads the server state (D6).
import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { ApiError } from '../api/client'
import { getContent, saveRecovered } from '../api/content'
import { fromBase64, toBase64 } from './base64'
import { pendingFor, type Pending, type PendingStore, type Slots } from './pendingStore'
import { EMPTY_PAGE_STATE } from './schema'
import { holdSlot, isHeld } from './slotLock'

/** failed = the server refused for a reason a retry cannot fix; recovered = kept privately, reload the page. */
export type SaveState = 'saved' | 'saving' | 'offline' | 'retrying' | 'failed' | 'recovered'

export interface SaveStatus {
  state: SaveState
  /** Why it failed, or the recovered notice. */
  message?: string
  /** false = the unsaved changes could NOT be stored on this device. */
  local: boolean
}

export const RECOVERED_NOTICE = 'Your unsaved changes were kept as a private version because this page was restored'
/** Spring's reason when a page is in the trash (NodeAccessService). */
export const IN_TRASH = 'This page is in the trash'
export const KEPT_IN_TRASH = 'This page is in the trash. Your last changes are kept on this device and are added back if the page is restored.'
export const LOST_NOTICE = "You can't edit this page anymore, so your last changes couldn't be saved. Copy anything you need before leaving."

export interface Opened {
  ydoc: Y.Doc
  /** Revision the next save is based on. */
  revision: number
  /** Content epoch this copy is based on. */
  epoch: number
  /** The copy is from an older epoch than the server's: it must be kept privately, never saved to the page. */
  recover: boolean
  state: SaveState
  /** This editing session's own slot in the pending store, and the lock that marks it as alive. */
  slot: string
  store: PendingStore
  release: () => void
  /** Best known plain text of an unsaved copy taken over on open. */
  text?: string
  /** Slots of earlier sessions merged into this copy: cleared once this session has stored its own. */
  adopt?: string[]
}

const DEBOUNCE_MS = 1000
const CLOSE_TOO_BIG = 1009
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000]
/** Statuses that will not get better by sending the same thing again. */
const PERMANENT = new Set([400, 403, 404, 413])

const encode = (doc: Y.Doc) => toBase64(Y.encodeStateAsUpdate(doc))
const lockName = (store: PendingStore, slot: string) => `${store.key}.${slot}`

function docFrom(...states: string[]): Y.Doc {
  const doc = new Y.Doc()
  for (const s of states) if (s) Y.applyUpdate(doc, fromBase64(s))
  return doc
}

/**
 * Loads a page. With edit access, unsaved copies that earlier sessions of this user left on the device
 * come first (spec 5.3 rule 4): same epoch = merged in and saved, older epoch = kept privately.
 */
export async function openContent(nodeId: string, canEdit: boolean, userId: string): Promise<Opened> {
  const store = pendingFor(userId, nodeId)
  const [server, slots] = await Promise.all([
    // QA-53: unreachable (not refused) with edit access: the copy kept on this device may still open the page.
    getContent(nodeId).catch((e: unknown) => {
      if (e instanceof ApiError || !canEdit) throw e
      return null
    }),
    canEdit ? store.all() : ({} as Slots),
  ])
  const slot = Math.random().toString(36).slice(2)
  const release = canEdit ? await holdSlot(lockName(store, slot)) : () => {}
  const mine = { store, slot, release }

  const orphans: { id: string; pending: Pending }[] = []
  for (const [id, pending] of Object.entries(slots)) {
    if (await isHeld(lockName(store, id))) continue // belongs to a tab that is still open: not ours to touch
    // The server already holds every edit in this copy (it was stored before the tab could clear it). That is the
    // ONLY reason a copy is removed without being sent: however old it is, it is merged or kept privately below.
    if (server && (pending.state === server.state || (pending.epoch === server.contentEpoch && storedAll(server.state, pending.state)))) {
      await store.clear(id)
      continue
    }
    try {
      docFrom(pending.state) // can it be read at all?
      orphans.push({ id, pending })
    } catch {
      await store.quarantine(id) // one broken copy must not make the page impossible to open
    }
  }

  if (!server) {
    // Offline: open the newest kept copy (merged with others of its epoch) as unsaved; the autosave sends it once online,
    // and a 409 then merges in whatever the server got meanwhile.
    const newest = orphans.reduce<(typeof orphans)[number] | undefined>((a, o) => (!a || o.pending.at > a.pending.at ? o : a), undefined)
    if (!newest) {
      release()
      throw new Error('Offline, and no copy of this page is kept on this device.')
    }
    const same = orphans.filter((o) => o.pending.epoch === newest.pending.epoch)
    return {
      ...mine, ydoc: docFrom(...same.map((o) => o.pending.state)), revision: newest.pending.baseRevision, epoch: newest.pending.epoch,
      recover: false, state: 'offline', text: newest.pending.text, adopt: same.map((o) => o.id),
    }
  }

  // Nothing is moved here: React may throw this result away (StrictMode, a re-run effect), and a copy moved into
  // a slot nobody uses would be hidden from the open that is used (QA-40). The Autosave takes the copies over.
  // A copy from before a restore goes first and alone; the reload after it handles the rest.
  const old = orphans.find((o) => o.pending.epoch !== server.contentEpoch)
  if (old) {
    return {
      ...mine, ydoc: docFrom(old.pending.state), revision: old.pending.baseRevision, epoch: old.pending.epoch,
      recover: true, state: 'saving', text: old.pending.text, adopt: [old.id],
    }
  }

  const ydoc = docFrom(server.state || EMPTY_PAGE_STATE, ...orphans.map((o) => o.pending.state))
  const current = { ...mine, ydoc, revision: server.revision, epoch: server.contentEpoch, recover: false }
  if (!orphans.length) return { ...current, state: 'saved' }

  const text = orphans.map((o) => o.pending.text).join('\n')
  return { ...current, state: 'saving', text, adopt: orphans.map((o) => o.id) }
}

/** The server state holds every insert and deletion of the copy. A copy that cannot be read is not "held". */
function storedAll(serverState: string, copy: string): boolean {
  try {
    return covers(Y.snapshot(docFrom(serverState || EMPTY_PAGE_STATE)), needOf(docFrom(copy)))
  } catch {
    return false
  }
}

/** Clock per Yjs client: a state vector. */
type Ranges = Map<number, { clock: number; len: number }[]>

/**
 * What the collaboration service must have stored before a local copy may go: inserted items (a clock per Yjs
 * client) AND deletions (they do not move a state vector, so clocks alone would let a deletion be lost).
 */
export interface Need {
  clocks: Map<number, number>
  deletes: Ranges
}

/** Everything in this doc. */
export const needOf = (doc: Y.Doc): Need => {
  const s = Y.snapshot(doc)
  return { clocks: s.sv, deletes: s.ds.clients as Ranges }
}

function addDeletes(into: Ranges, from: Ranges) {
  for (const [client, items] of from) into.set(client, [...(into.get(client) ?? []), ...items])
}

/** Every range in `need` lies inside the union of the ranges in `have`. */
function rangesCovered(have: Ranges, need: Ranges): boolean {
  for (const [client, items] of need) {
    const ranges = [...(have.get(client) ?? [])].sort((a, b) => a.clock - b.clock)
    for (const item of items) {
      let from = item.clock
      const end = item.clock + item.len
      for (const r of ranges) if (r.clock <= from && r.clock + r.len > from) from = r.clock + r.len
      if (from < end) return false
    }
  }
  return true
}

/** True when what the service stored holds every edit this tab still has to see confirmed. */
export function covers(stored: Y.Snapshot, need: Need): boolean {
  for (const [client, clock] of need.clocks) if ((stored.sv.get(client) ?? 0) < clock) return false
  return rangesCovered(stored.ds.clients as Ranges, need.deletes)
}

/** The snapshot a `saved` message carries (base64 Y.encodeSnapshot). */
export const storedSnapshot = (snap: string) => Y.decodeSnapshot(fromBase64(snap))

/** The part of HocuspocusProvider the local copy listens to. */
export interface ProviderEvents {
  on(event: 'stateless', cb: (data: { payload: string }) => void): unknown
  on(event: 'status', cb: (data: { status: string }) => void): unknown
  on(event: 'close', cb: (data: { event: { code: number } }) => void): unknown
  off(event: 'stateless', cb: (data: { payload: string }) => void): unknown
  off(event: 'status', cb: (data: { status: string }) => void): unknown
  off(event: 'close', cb: (data: { event: { code: number } }) => void): unknown
}

/**
 * The tab's local copy while the page is edited live. Every local change is written to IndexedDB at once; the
 * collaboration service sends the changes on and stores them, then says `saved` with the state vector it stored.
 * The copy is cleared only when that vector holds every edit made here (other people's edits do not count:
 * they came from the server). A copy from before a restore is kept as a private version instead (D6).
 */
export class Autosave {
  state: SaveState
  message: string | undefined
  private local = true
  private recover: boolean
  private dirty: boolean
  private connected = false
  /** The browser says it is online. A socket can look open for a while after the network went away. */
  private online = typeof navigator === 'undefined' || navigator.onLine !== false
  private version = 0 // bumped on every local change, to tell whether an async step is still current
  private attempt = 0
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private text: string | undefined // as of the last change; the editor may be gone later
  private need: Need = { clocks: new Map(), deletes: new Map() }
  /** Edits here can never be stored any more (see lost()). */
  private lostEdits = false
  /** ...but the local copy is kept (page in the trash): leaving loses nothing. */
  private kept = false
  private writing: Promise<boolean> = Promise.resolve(true)

  constructor(
    private nodeId: string,
    private ydoc: Y.Doc,
    private getText: () => string,
    private opened: Omit<Opened, 'ydoc'>,
    private onStatus: (status: SaveStatus) => void,
    private provider: ProviderEvents | null,
  ) {
    this.state = opened.state
    this.recover = opened.recover
    this.dirty = opened.state !== 'saved'
    this.text = opened.text
    if (this.dirty && !this.recover) this.need = needOf(ydoc) // copies taken over on open: all of it must be stored
    ydoc.on('update', this.onUpdate)
    provider?.on('stateless', this.onStateless)
    provider?.on('status', this.onProviderStatus)
    provider?.on('close', this.onClose)
    window.addEventListener('beforeunload', this.onBeforeUnload)
    window.addEventListener('offline', this.onNetwork)
    window.addEventListener('online', this.onNetwork)
    // Under this session's slot first, and only then remove the old ones: never a moment without a copy.
    const adopt = opened.adopt ?? []
    if (adopt.length) void this.storePending().then(async (ok) => { if (ok) for (const id of adopt) await opened.store.clear(id) })
    // A copy from before a restore: wait until the editor has rendered it, so its text can be read.
    if (this.recover) this.timer = setTimeout(() => void this.keepPrivately(), DEBOUNCE_MS)
  }

  /** Stops listening. Unconfirmed changes stay in the pending store and are picked up later (open, online, logout). */
  destroy() {
    if (this.stopped) return
    this.ydoc.off('update', this.onUpdate)
    this.provider?.off('stateless', this.onStateless)
    this.provider?.off('status', this.onProviderStatus)
    this.provider?.off('close', this.onClose)
    window.removeEventListener('beforeunload', this.onBeforeUnload)
    window.removeEventListener('offline', this.onNetwork)
    window.removeEventListener('online', this.onNetwork)
    clearTimeout(this.timer)
    this.stopped = true
    this.opened.release() // from here on the slot counts as orphaned
  }

  /**
   * The page was restored while open (D6): unconfirmed edits here must not be merged into it, so they are kept as a
   * private version ('recovered' follows). Returns true when there was nothing to keep and the page can reload now.
   */
  restored(): boolean {
    if (!this.dirty) return true
    this.recover = true
    clearTimeout(this.timer)
    void this.keepPrivately()
    return false
  }

  /**
   * Edit rights are gone (or the edits were refused at the size limit): what is unconfirmed here can never be sent.
   * The text stays on screen and leaving still asks first, but the local copy goes and no version is made.
   * `inTrash`: the page can still be restored, so the copy stays on the device (sent then) and leaving is safe.
   * Returns true when nothing was unconfirmed.
   */
  lost(inTrash = false): boolean {
    if (!this.dirty || this.recover) return !this.dirty
    if (this.lostEdits) return false
    this.lostEdits = true
    clearTimeout(this.timer)
    if (inTrash) {
      this.kept = true
      this.setState('failed', KEPT_IN_TRASH)
      return false
    }
    const slots = [this.opened.slot, ...(this.opened.adopt ?? [])]
    void this.writing.then(() => Promise.all(slots.map((id) => this.opened.store.clear(id))))
    this.setState('failed', LOST_NOTICE)
    return false
  }

  /** Edit rights are back (unlocked, restored from the trash): the edits sync again, so the copy is kept again. */
  regained() {
    if (!this.lostEdits || this.stopped) return
    this.lostEdits = false
    this.kept = false
    this.message = undefined
    void this.storePending()
    this.state = 'failed' // so the next line always reports
    if (this.dirty) this.showConnection()
    else this.setState('saved')
  }

  private readText(): string {
    try {
      return this.getText()
    } catch {
      return this.text ?? '' // editor already unmounted
    }
  }

  private snapshot() {
    return { state: encode(this.ydoc), text: this.text ?? this.readText() }
  }

  // shortcut: writes the whole encoded page on every change; store incremental Yjs updates instead if
  // typing on very large pages becomes slow.
  private storePending(): Promise<boolean> {
    const copy = { ...this.snapshot(), baseRevision: this.opened.revision, epoch: this.opened.epoch, at: Date.now() }
    return (this.writing = this.opened.store.put(this.opened.slot, copy).then((ok) => {
      if (ok !== this.local) {
        this.local = ok
        this.emit()
      }
      return ok
    }))
  }

  private emit() {
    if (!this.stopped) this.onStatus({ state: this.state, message: this.message, local: this.local })
  }

  private setState(state: SaveState, message?: string) {
    if (state === this.state && message === this.message) return
    this.state = state
    this.message = message
    this.emit()
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this.provider || this.lostEdits) return // someone else's edit, from the server
    this.version++
    this.dirty = true
    this.need.clocks.set(this.ydoc.clientID, Y.decodeStateVector(Y.encodeStateVector(this.ydoc)).get(this.ydoc.clientID) ?? 0)
    addDeletes(this.need.deletes, Y.decodeUpdate(update).ds.clients as Ranges)
    this.text = this.readText()
    void this.storePending()
    if (this.recover) return // keepPrivately picks the change up
    this.showConnection()
  }

  private showConnection() {
    if (this.dirty && !this.recover) this.setState(this.connected && this.online ? 'saving' : 'offline')
  }

  private onProviderStatus = ({ status }: { status: string }) => {
    this.connected = status === 'connected'
    this.showConnection()
  }

  /** 1009: a change too large for one message. Sending it again is refused again: it can never be stored. */
  private onClose = ({ event }: { event: { code: number } }) => {
    if (event.code === CLOSE_TOO_BIG) this.lost()
  }

  private onNetwork = () => {
    this.online = navigator.onLine !== false
    this.showConnection()
  }

  private onStateless = ({ payload }: { payload: string }) => {
    let m: { type?: string; snap?: string; final?: boolean }
    try {
      m = JSON.parse(payload)
    } catch {
      return
    }
    if (this.recover || this.lostEdits) return
    // at the size limit and the last store is done: what its snapshot does not cover was refused
    if (m.type === 'too-large' && m.final) {
      if (!this.dirty || !m.snap || !covers(storedSnapshot(m.snap), this.need)) return void this.lost()
      m = { type: 'saved', snap: m.snap }
    }
    if (m.type === 'retrying' && this.dirty) this.setState('retrying')
    if (m.type !== 'saved' || !m.snap) return
    if (!this.dirty) return this.setState('saved')
    if (!covers(storedSnapshot(m.snap), this.need)) return
    this.dirty = false
    this.need = { clocks: new Map(), deletes: new Map() }
    const v = this.version
    // a change typed while the copy is being removed is written again right after
    void this.opened.store.clear(this.opened.slot).then(() => this.version !== v && this.storePending())
    this.setState('saved')
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!this.dirty || this.kept) return
    e.preventDefault()
    e.returnValue = '' // older browsers need this to show the "Leave page?" prompt
  }

  /** The local copy must not go into the page: store it as a version only this user sees. */
  private async keepPrivately(): Promise<void> {
    if (this.stopped) return // the copy stays in the pending store; the next open sends it
    const v = this.version
    try {
      await saveRecovered(this.nodeId, { ...this.snapshot(), baseEpoch: this.opened.epoch })
    } catch (e) {
      return this.failed(e)
    }
    if (this.version !== v) return this.keepPrivately() // typed meanwhile: keep that too
    this.dirty = false
    await this.opened.store.clear(this.opened.slot) // only now: the copy is safe on the server
    this.setState('recovered', RECOVERED_NOTICE)
  }

  private failed(e: unknown) {
    if (this.stopped) return
    const reason = e instanceof Error ? e.message : 'unknown error'
    if (e instanceof ApiError && PERMANENT.has(e.status)) return this.setState('failed', reason)
    this.setState(
      navigator.onLine === false ? 'offline' : 'retrying',
      `Your unsaved changes could not be kept as a private version yet (${reason}). They are still on this device; trying again.`,
    )
    this.timer = setTimeout(() => void this.keepPrivately(), BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)])
  }
}

/**
 * Keeps the local copy of an opened page while `enabled` (edit access). Waits for the provider: undefined = still
 * starting, null = this copy does not join the live session (a copy from before a restore).
 */
export function useAutosave(
  nodeId: string,
  opened: Opened,
  getText: () => string,
  enabled: boolean,
  provider: ProviderEvents | null | undefined,
): SaveStatus & { restored: () => boolean; lost: (inTrash?: boolean) => boolean; regained: () => void } {
  const [status, setStatus] = useState<SaveStatus>({ state: opened.state, local: true })
  const [text] = useState(() => ({ read: getText }))
  text.read = getText
  const live = useRef<Autosave | null>(null)

  useEffect(() => {
    if (!enabled || provider === undefined) return
    const autosave = new Autosave(nodeId, opened.ydoc, () => text.read(), opened, setStatus, provider)
    live.current = autosave
    setStatus({ state: autosave.state, local: true })
    return () => {
      live.current = null
      autosave.destroy()
    }
  }, [nodeId, opened, enabled, text, provider])

  /** See Autosave.restored / Autosave.lost; true without edit access (nothing is kept here). */
  return { ...status, restored: () => live.current?.restored() ?? true, lost: (inTrash?: boolean) => live.current?.lost(inTrash) ?? true, regained: () => live.current?.regained() }
}
