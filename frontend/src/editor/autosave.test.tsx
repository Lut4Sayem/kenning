import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ApiError } from '../api/client'
import { Autosave, covers, openContent, RECOVERED_NOTICE, type Opened, type SaveState, type SaveStatus } from './autosave'
import { fromBase64, toBase64 } from './base64'
import type { Pending } from './pendingStore'
import SaveIndicator from './SaveIndicator'

// Fake server with the real revision rule, and an in-memory stand-in for IndexedDB (shared by all "tabs").
const server = {
  revision: 3,
  epoch: 0,
  state: '',
  recovered: [] as { state: string; text: string; baseEpoch: number }[],
  /** What version restore will do (Task 6.1): replace the state wholesale and start a new epoch. */
  restore(doc: Y.Doc) {
    server.state = stateOf(doc)
    server.revision++
    server.epoch++
  },
}
const contentApi = vi.hoisted(() => ({ getContent: vi.fn(), saveRecovered: vi.fn() }))
vi.mock('../api/content', () => contentApi)
const idb = vi.hoisted(() => ({ slots: new Map<string, Record<string, unknown>>(), bad: [] as string[], broken: false }))
vi.mock('./pendingStore', () => ({
  pendingFor: (userId: string, nodeId: string) => {
    const key = `kf.pending.${userId}.${nodeId}`
    const drop = (slot: string) => {
      const rest = { ...idb.slots.get(key) }
      delete rest[slot]
      idb.slots.set(key, rest)
    }
    return {
      key,
      put: async (slot: string, p: unknown) => {
        if (idb.broken) return false
        idb.slots.set(key, { ...idb.slots.get(key), [slot]: p })
        return true
      },
      all: async () => idb.slots.get(key) ?? {},
      clear: async (slot: string) => drop(slot),
      quarantine: async (slot: string) => {
        idb.bad.push(slot)
        drop(slot)
      },
    }
  },
}))

const NODE = 'n1'
const USER = 'u1'
const KEY = `kf.pending.${USER}.${NODE}`
const pendingOf = (slot: string) => idb.slots.get(KEY)?.[slot] as Pending | undefined
/** The one local copy on the device (fails when there are several). */
const pending = () => {
  const all = Object.values(idb.slots.get(KEY) ?? {}) as Pending[]
  expect(all.length).toBeLessThanOrEqual(1)
  return all[0] as Pending | undefined
}
/** A copy left behind by a tab that is gone. */
const leftover = (p: Partial<Pending> & { state: string; text: string }, slot = 'old') =>
  idb.slots.set(KEY, { ...idb.slots.get(KEY), [slot]: { baseRevision: 3, epoch: 0, at: Date.now(), ...p } })

const stateOf = (doc: Y.Doc) => toBase64(Y.encodeStateAsUpdate(doc))
const textOf = (doc: Y.Doc) => doc.getText('t').toString()
const type = (doc: Y.Doc, s: string) => doc.getText('t').insert(doc.getText('t').length, s)
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)
/** A copy of the server's document, like another client would hold. */
const serverDoc = () => {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, fromBase64(server.state))
  return doc
}

/** Stand-in for the HocuspocusProvider: the test plays the collaboration service. */
function fakeProvider() {
  const subs = new Map<string, Set<(d: never) => void>>()
  const emit = (event: string, data: unknown) => subs.get(event)?.forEach((cb) => cb(data as never))
  return {
    on: (event: string, cb: (d: never) => void) => void subs.set(event, (subs.get(event) ?? new Set()).add(cb)),
    off: (event: string, cb: (d: never) => void) => void subs.get(event)?.delete(cb),
    status: (status: 'connected' | 'disconnected') => emit('status', { status }),
    /** The service stored this doc's state and says so. */
    saved: (doc: Y.Doc) => emit('stateless', { payload: JSON.stringify({ type: 'saved', revision: 9, snap: toBase64(Y.encodeSnapshot(Y.snapshot(doc))) }) }),
    retrying: () => emit('stateless', { payload: JSON.stringify({ type: 'retrying' }) }),
  }
}

const live: Autosave[] = []
function start(opened: Opened) {
  const seen: SaveStatus[] = []
  const provider = fakeProvider()
  const a = new Autosave(NODE, opened.ydoc, () => textOf(opened.ydoc), opened, (s) => seen.push(s), provider)
  provider.status('connected')
  live.push(a)
  return { a, seen, states: () => seen.map((s) => s.state), doc: opened.ydoc, slot: opened.slot, provider }
}
/** Opens the page like a tab would. */
const openTab = async () => start(await openContent(NODE, true, USER))

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

/** Web Locks stand-in: a lock is held while its callback runs, as in the browser. */
function fakeLocks() {
  const held = new Set<string>()
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: {
      request(name: string, a: unknown, b?: unknown) {
        const options = typeof a === 'function' ? {} : (a as { ifAvailable?: boolean })
        const run = (typeof a === 'function' ? a : b) as (lock: object | null) => Promise<unknown>
        if (held.has(name)) return options.ifAvailable ? Promise.resolve(run(null)) : new Promise(() => {})
        held.add(name)
        return Promise.resolve(run({ name })).finally(() => held.delete(name))
      },
      query: async () => ({ held: [...held].map((name) => ({ name })) }),
    },
  })
  return held
}

beforeEach(() => {
  vi.useFakeTimers()
  const base = new Y.Doc()
  type(base, 'base ')
  Object.assign(server, { revision: 3, epoch: 0, state: stateOf(base), recovered: [] })
  contentApi.getContent.mockImplementation(async () => ({ format: 'YJS_BLOCKNOTE_V1', state: server.state, revision: server.revision, contentEpoch: server.epoch }))
  contentApi.saveRecovered.mockImplementation(async (_id: string, body: { state: string; text: string; baseEpoch: number }) => {
    server.recovered.push(body)
    return { id: 'v' + server.recovered.length, createdAt: '' }
  })
})

afterEach(() => {
  live.splice(0).forEach((a) => a.destroy())
  cleanup()
  idb.slots.clear()
  idb.bad.length = 0
  idb.broken = false
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setOnline(true)
})

describe('autosave', () => {
  it('localCopyOnEveryChange', async () => {
    const { a, doc } = await openTab()
    type(doc, 'a')
    await tick(0)
    expect(pending()).toMatchObject({ state: stateOf(doc), text: 'base a', baseRevision: 3, epoch: 0 })
    expect(a.state).toBe('saving')
    type(doc, 'b')
    await tick(0)
    expect(pending()).toMatchObject({ state: stateOf(doc), text: 'base ab' })
  })

  it('copyClearedOnlyOnCoveringSaved', async () => {
    const { a, doc, provider } = await openTab()
    type(doc, 'one ')
    const stored = new Y.Doc()
    Y.applyUpdate(stored, Y.encodeStateAsUpdate(doc)) // what the service stored: 'one ' only
    type(doc, 'two')
    await tick(0)
    provider.saved(stored)
    await tick(0)
    expect(a.state).toBe('saving') // 'two' is not in it
    expect(pending()).toMatchObject({ text: 'base one two' })
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('othersEditsDoNotHoldBackTheConfirmation', async () => {
    const { a, doc, provider } = await openTab()
    type(doc, 'mine ')
    const stored = new Y.Doc()
    Y.applyUpdate(stored, Y.encodeStateAsUpdate(doc))
    const other = serverDoc()
    type(other, 'theirs')
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), provider) // arrives from the server after the store
    await tick(0)
    provider.saved(stored)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('remoteEditsAloneLeaveNoLocalCopy', async () => {
    const { a, doc, provider } = await openTab()
    const other = serverDoc()
    type(other, 'theirs')
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), provider)
    await tick(0)
    expect(pending()).toBeUndefined()
    expect(a.state).toBe('saved')
  })

  it('aChangeTypedWhileTheCopyIsClearedIsKept', async () => {
    const { doc, provider } = await openTab()
    type(doc, 'a')
    await tick(0)
    provider.saved(doc)
    type(doc, 'b') // before the clear has finished
    await tick(0)
    expect(pending()).toMatchObject({ text: 'base ab' })
  })

  it('replaysPendingOnOpen', async () => {
    const mine = serverDoc()
    type(mine, 'unsent edit')
    leftover({ state: stateOf(mine), text: 'base unsent edit' })

    const opened = await openContent(NODE, true, USER)
    expect(textOf(opened.ydoc)).toBe('base unsent edit') // local changes first
    expect(opened.state).toBe('saving')
    expect(pendingOf('old')).toBeDefined() // opening alone moves nothing (it may be thrown away)

    const { a, provider } = start(opened)
    await tick(0)
    expect(pendingOf('old')).toBeUndefined() // taken over under this session's own slot
    expect(pendingOf(opened.slot)).toMatchObject({ text: 'base unsent edit', baseRevision: 3, epoch: 0 })
    provider.saved(serverDoc()) // a store from before the replay reached the service
    await tick(0)
    expect(a.state).toBe('saving')
    provider.saved(opened.ydoc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('openDropsAPendingCopyTheServerAlreadyHas', async () => {
    // The flush on tab close succeeded, but the tab died before it could clear its local copy.
    leftover({ state: server.state, text: 'base ', baseRevision: 2 })
    const { a } = await openTab()
    await tick(2000)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('viewersNeverReplayAPendingCopy', async () => {
    const mine = serverDoc()
    type(mine, 'unsent edit')
    leftover({ state: stateOf(mine), text: 'base unsent edit' })
    const opened = await openContent(NODE, false, USER)
    expect(textOf(opened.ydoc)).toBe('base ')
    expect(opened.state).toBe('saved')
  })

  it('openMergesAnOldCopyOfTheSameEpoch', async () => {
    const mine = serverDoc()
    type(mine, 'my offline edit. ')
    leftover({ state: stateOf(mine), text: 'base my offline edit. ', baseRevision: 3 })
    const other = serverDoc()
    type(other, 'saved by a teammate. ')
    Object.assign(server, { state: stateOf(other), revision: 4 }) // the page moved on while my copy sat on the device

    const { a, doc, provider } = await openTab()
    expect(textOf(doc)).toContain('my offline edit. ')
    expect(textOf(doc)).toContain('saved by a teammate. ')
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  // D6 epoch rule: after a restore the old lineage must not come back through a merge.
  it('restoredWhileOpenKeepsUnconfirmedEditsPrivately', async () => {
    const { a, doc, slot } = await openTab()
    type(doc, 'and my unsaved words')
    const mine = stateOf(doc)
    expect(a.restored()).toBe(false)
    await tick(0)
    expect(server.recovered).toEqual([{ state: mine, text: 'base and my unsaved words', baseEpoch: 0 }])
    expect(a.state).toBe('recovered')
    expect(a.message).toBe('Your unsaved changes were kept as a private version because this page was restored')
    expect(RECOVERED_NOTICE).toBe('Your unsaved changes were kept as a private version because this page was restored')
    expect(pendingOf(slot)).toBeUndefined() // cleared, but only now that the copy is safe on the server
  })

  it('restoredWithNothingUnconfirmedJustReloads', async () => {
    const { a, doc, provider } = await openTab()
    type(doc, 'x')
    provider.saved(doc)
    await tick(0)
    expect(a.restored()).toBe(true)
    expect(server.recovered).toHaveLength(0)
  })

  it('aLeftoverCopyFromBeforeARestoreIsKeptPrivatelyOnOpen', async () => {
    const mine = serverDoc()
    type(mine, 'typed before the restore')
    leftover({ state: stateOf(mine), text: 'base typed before the restore', baseRevision: 3, epoch: 0 })
    const restored = new Y.Doc()
    type(restored, 'restored')
    server.restore(restored)

    const { a, doc } = await openTab()
    expect(textOf(doc)).toBe('base typed before the restore') // my copy stays on screen until it is safe
    await tick(1000)
    expect(server.recovered).toEqual([{ state: stateOf(mine), text: 'base typed before the restore', baseEpoch: 0 }])
    expect(a.state).toBe('recovered')
    expect(pending()).toBeUndefined()
  })

  it('recoveryFailureKeepsLocalCopy', async () => {
    const { a, doc, slot } = await openTab()
    contentApi.saveRecovered.mockRejectedValueOnce(new ApiError(500, 'Database is down'))
    type(doc, 'my unsaved words')
    a.restored()
    await tick(0)

    expect(a.state).toBe('retrying')
    expect(a.message).toContain('Database is down') // the error is shown
    expect(pendingOf(slot)).toMatchObject({ state: stateOf(doc), text: 'base my unsaved words', epoch: 0 }) // still on the device

    await tick(1000) // first backoff step: retried, this time it works
    expect(server.recovered).toEqual([{ state: stateOf(doc), text: 'base my unsaved words', baseEpoch: 0 }])
    expect(a.state).toBe('recovered')
    expect(pendingOf(slot)).toBeUndefined()
  })

  it('recoveryRefusedForGoodSaysWhy', async () => {
    const { a, doc } = await openTab()
    contentApi.saveRecovered.mockRejectedValueOnce(new ApiError(413, 'Page is too large'))
    type(doc, 'x')
    a.restored()
    await tick(0)
    expect(a.state).toBe('failed')
    expect(a.message).toBe('Page is too large')
    expect(pending()).toBeDefined()
  })

  it('offlineShowsOfflineText', async () => {
    const { a, doc, seen, provider } = await openTab()
    provider.status('disconnected')
    type(doc, 'typed offline')
    await tick(0)

    expect(a.state).toBe('offline')
    render(<SaveIndicator {...seen.at(-1)!} />)
    expect(screen.getByRole('status').textContent).toBe('Offline: changes kept on this device')
    expect(pending()).toMatchObject({ text: 'base typed offline', baseRevision: 3 })

    provider.status('connected')
    expect(a.state).toBe('saving') // the provider sends what was typed offline
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  // QA-53: opening a page while offline showed "Could not load this page’s content" although a copy was on the device.
  it('openingOfflineShowsTheKeptCopy', async () => {
    const mine = serverDoc()
    type(mine, 'typed offline earlier')
    leftover({ state: stateOf(mine), text: 'base typed offline earlier' })
    contentApi.getContent.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const opened = await openContent(NODE, true, USER)
    expect(textOf(opened.ydoc)).toBe('base typed offline earlier')
    expect(opened.state).toBe('offline')
    const { a, provider } = start(opened)
    provider.saved(opened.ydoc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('openingOfflineWithNothingKeptStillFails', async () => {
    contentApi.getContent.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(openContent(NODE, true, USER)).rejects.toThrow()
    contentApi.getContent.mockRejectedValueOnce(new ApiError(404, 'Page not found'))
    leftover({ state: server.state, text: 'x' }) // a refusal is not "offline": never opened from the device
    await expect(openContent(NODE, true, USER)).rejects.toThrow('Page not found')
  })

  it('theBrowserGoingOfflineShowsOfflineEvenWhileTheSocketLooksOpen', async () => {
    const { a, doc } = await openTab()
    setOnline(false)
    window.dispatchEvent(new Event('offline'))
    type(doc, 'typed offline')
    await tick(0)
    expect(a.state).toBe('offline')
    setOnline(true)
    window.dispatchEvent(new Event('online'))
    expect(a.state).toBe('saving')
  })

  it('offlineWithoutALocalCopyDoesNotClaimOne', async () => {
    const { a, doc, seen, provider } = await openTab()
    idb.broken = true // IndexedDB blocked or full
    provider.status('disconnected')
    type(doc, 'typed offline')
    await tick(0)

    expect(a.state).toBe('offline')
    expect(seen.at(-1)).toMatchObject({ state: 'offline', local: false })
    render(<SaveIndicator {...seen.at(-1)!} />)
    expect(screen.getByRole('status').textContent).toBe('Offline: changes are only in this open tab')
  })

  it('retryingStateAfterRetryMessage', async () => {
    const { a, doc, provider } = await openTab()
    type(doc, 'a')
    provider.retrying()
    expect(a.state).toBe('retrying')
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
  })

  it('leavePromptOnlyWhileChangesAreUnconfirmed', async () => {
    const { doc, provider } = await openTab()
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(leave()).toBe(false) // saved: no prompt
    type(doc, 'a')
    expect(leave()).toBe(true) // not confirmed yet
    provider.saved(doc)
    await tick(0)
    expect(leave()).toBe(false)
    type(doc, 'b')
    provider.retrying()
    expect(leave()).toBe(true)
  })

  it('leavingThePageKeepsTheUnconfirmedCopyAndStopsListening', async () => {
    const held = fakeLocks()
    const { a, doc, slot } = await openTab()
    type(doc, 'last words')
    await tick(0)
    a.destroy()
    await tick(0)
    expect(pendingOf(slot)).toMatchObject({ text: 'base last words' }) // picked up by the next open or the logout
    expect([...held]).not.toContain(`${KEY}.${slot}`) // and it counts as orphaned now

    type(doc, ' after')
    await tick(0)
    expect(pendingOf(slot)).toMatchObject({ text: 'base last words' })
  })

  // Nothing is ever deleted unsent: age does not matter, only the epoch decides what happens to a copy.
  it('anOldCopyOfTheSameEpochIsStillMerged', async () => {
    const old = serverDoc()
    type(old, 'typed a year ago')
    leftover({ state: stateOf(old), text: 'base typed a year ago', at: Date.now() - 365 * 24 * 3600 * 1000 }, 'ancient')

    const { a, doc, provider } = await openTab()
    expect(textOf(doc)).toBe('base typed a year ago')
    await tick(0)
    expect(pending()).toBeDefined() // gone only once the service has it
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('anOldCopyFromAnotherEpochIsStillKeptAsAPrivateVersion', async () => {
    const old = serverDoc()
    type(old, 'typed a year ago')
    leftover({ state: stateOf(old), text: 'base typed a year ago', at: Date.now() - 365 * 24 * 3600 * 1000 }, 'ancient')
    const restored = new Y.Doc()
    type(restored, 'restored')
    server.restore(restored)

    const { a } = await openTab()
    await tick(0)
    expect(pending()).toMatchObject({ text: 'base typed a year ago' }) // still on the device while unsent
    await tick(1000)
    expect(server.recovered).toEqual([{ state: stateOf(old), text: 'base typed a year ago', baseEpoch: 0 }])
    expect(a.state).toBe('recovered')
    expect(pending()).toBeUndefined()
  })

  it('aCopyThatCannotBeReadIsQuarantinedAndThePageStillOpens', async () => {
    leftover({ state: '!!! not base64 !!!', text: 'x' }, 'garbage')
    leftover({ state: toBase64(new Uint8Array([1, 2, 3, 250, 251, 252, 253])), text: 'x' }, 'truncated')
    const good = serverDoc()
    type(good, 'good copy')
    leftover({ state: stateOf(good), text: 'base good copy' }, 'good')

    const { doc } = await openTab()
    expect(textOf(doc)).toBe('base good copy')
    expect(idb.bad.sort()).toEqual(['garbage', 'truncated'])
    expect(pendingOf('garbage')).toBeUndefined()
  })

  // QA-40: React may start loading a page twice and throw the first result away (StrictMode, a re-run effect).
  // The thrown-away open must not move the unsent copy somewhere the used one never looks.
  it('anOpenThatIsThrownAwayDoesNotHideTheUnsentCopy', async () => {
    fakeLocks()
    const earlier = serverDoc()
    type(earlier, 'typed offline')
    leftover({ state: stateOf(earlier), text: 'base typed offline' })

    const [thrownAway, used] = await Promise.all([openContent(NODE, true, USER), openContent(NODE, true, USER)])
    thrownAway.release()
    expect(textOf(used.ydoc)).toBe('base typed offline')
    expect(used.state).toBe('saving')

    const { a, provider } = start(used)
    await tick(0)
    provider.saved(used.ydoc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  // Review findings 1 and 9: a second tab must not take over (and later clear) a live tab's copy.
  it('aLiveTabsCopyIsLeftAlone', async () => {
    const held = fakeLocks()

    const tabA = await openTab()
    type(tabA.doc, 'unsaved in A')
    await tick(0)
    expect(pendingOf(tabA.slot)).toMatchObject({ text: 'base unsaved in A' })

    const tabC = await openTab() // the user opens the page in another tab
    expect(tabC.slot).not.toBe(tabA.slot)
    expect(textOf(tabC.doc)).toBe('base ') // C starts from the server, it does not replay A's copy
    expect(pendingOf(tabA.slot)).toMatchObject({ text: 'base unsaved in A' }) // and A's copy is untouched

    tabC.a.destroy() // C closing must not clear A's copy either
    await tick(0)
    expect(pendingOf(tabA.slot)).toMatchObject({ text: 'base unsaved in A' })

    // Once A is really gone its copy is an orphan, and the next open picks it up.
    held.clear()
    const tabD = await openTab()
    expect(textOf(tabD.doc)).toBe('base unsaved in A')
    await tick(0)
    expect(pendingOf(tabA.slot)).toBeUndefined()
    tabD.provider.saved(tabD.doc)
    await tick(0)
    expect(tabD.a.state).toBe('saved')
  })

  // Review finding: a deletion does not move the state vector; a copy must not be cleared before it is stored.
  it('aDeleteIsConfirmedOnlyOnceStored', async () => {
    const { a, doc, provider } = await openTab()
    type(doc, 'abc')
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    const before = new Y.Doc()
    Y.applyUpdate(before, Y.encodeStateAsUpdate(doc)) // what the service stored: no deletion yet
    doc.getText('t').delete(0, 2)
    await tick(0)
    provider.saved(before)
    await tick(0)
    expect(a.state).toBe('saving')
    expect(pending()).toBeDefined()
    provider.saved(doc)
    await tick(0)
    expect(a.state).toBe('saved')
    expect(pending()).toBeUndefined()
  })

  it('coversNeedsEveryClockAndEveryDeletion', () => {
    const snap = (sv: [number, number][], ds: [number, number, number][] = []) => {
      const s = Y.snapshot(new Y.Doc())
      s.sv = new Map(sv)
      for (const [c, clock, len] of ds) s.ds.clients.set(c, [...(s.ds.clients.get(c) ?? []), { clock, len } as never])
      return s
    }
    const need = (clocks: [number, number][], deletes: [number, number, number][] = []) => ({
      clocks: new Map(clocks),
      deletes: new Map(deletes.map(([c, clock, len]) => [c, [{ clock, len }]])),
    })
    expect(covers(snap([[1, 5], [2, 3]]), need([[1, 5]]))).toBe(true)
    expect(covers(snap([[1, 4]]), need([[1, 5]]))).toBe(false)
    expect(covers(snap([]), need([[7, 1]]))).toBe(false) // an adopted copy's client the service never saw
    expect(covers(snap([]), need([]))).toBe(true)
    expect(covers(snap([[1, 9]], [[1, 0, 4], [1, 4, 3]]), need([[1, 9]], [[1, 2, 5]]))).toBe(true) // inside two joined ranges
    expect(covers(snap([[1, 9]], [[1, 0, 4]]), need([[1, 9]], [[1, 2, 5]]))).toBe(false) // half of it stored
  })

  it('saveIndicatorTextsAreExact', () => {
    const text = (state: SaveState) => {
      render(<SaveIndicator state={state} local />)
      const t = screen.getByRole('status').textContent
      cleanup()
      return t
    }
    expect(text('saved')).toBe('Saved')
    expect(text('saving')).toBe('Saving…')
    expect(text('offline')).toBe('Offline: changes kept on this device')
    expect(text('retrying')).toBe('Couldn’t save, retrying')
  })
})
