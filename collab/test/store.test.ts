import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createServer, EMPTY_PAGE_STATE, type Options } from '../src/server.js'
import { extractText } from '../src/extractText.js'
import { EpochError, RefusedError, RevisionError } from '../src/spring.js'
import pages from './fixtures/pages.json' with { type: 'json' }
import { connect, fakeSpring, ticket, testConfig, typeIn, until, type Client, type FakeSpring } from './helpers.js'

let server: ReturnType<typeof createServer> | undefined
const clients: Client[] = []
afterEach(async () => {
  clients.splice(0).forEach((c) => c.provider.destroy())
  await server?.destroy()
  server = undefined
})

async function start(spring: FakeSpring, opts: Partial<Options> = { debounce: 50, maxDebounce: 200 }) {
  server = createServer(testConfig(), spring, opts)
  await server.listen()
  return server.address.port
}
const join = async (port: number, over = {}) => {
  const c = connect(port, 'n1', ticket(over))
  clients.push(c)
  await c.synced
  return c
}
const text = (doc: Y.Doc) => extractText(doc.getXmlFragment('document-store'))

describe('loading', () => {
  it('loadsServerState', async () => {
    const page = pages.find((p) => p.name === 'status-and-bookmark')!
    const port = await start(fakeSpring({ state: Buffer.from(page.state, 'base64') }))
    const c = await join(port)
    await until(() => text(c.doc) === page.text)
  })

  it('emptyPageUsesFixedState', async () => {
    const port = await start(fakeSpring())
    await join(port)
    const doc = server!.hocuspocus.documents.get('n1')!
    expect(Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')).toBe(EMPTY_PAGE_STATE)
    expect(EMPTY_PAGE_STATE).toBe(pages.find((p) => p.name === 'empty-page')!.state)
  })

  it('noStoreWithoutEdits', async () => {
    const spring = fakeSpring()
    const port = await start(spring)
    await join(port)
    await new Promise((r) => setTimeout(r, 400))
    expect(spring.stores).toHaveLength(0)
  })
})

describe('storing', () => {
  it('storesAfterDebounce', async () => {
    const spring = fakeSpring({ revision: 3, epoch: 2 })
    const port = await start(spring, {}) // real 2 s debounce
    const c = await join(port, { epoch: 2 })
    const t0 = Date.now()
    typeIn(c.doc, 'hello')
    await new Promise((r) => setTimeout(r, 1800))
    expect(spring.stores).toHaveLength(0)
    await until(() => spring.stores.length === 1, 1500)
    expect(spring.stores[0].at - t0).toBeGreaterThanOrEqual(1900)
    expect(spring.stores[0].body).toMatchObject({ baseRevision: 3, baseEpoch: 2, text: 'hello', authors: ['u1'] })
  })

  it('viewerIsNotAnAuthor', async () => {
    const spring = fakeSpring()
    const port = await start(spring)
    const editor = await join(port, { userId: 'u1' })
    await join(port, { userId: 'u2', access: 'VIEW' })
    typeIn(editor.doc, 'x')
    await until(() => spring.stores.length === 1)
    expect(spring.stores[0].body.authors).toEqual(['u1'])
  })

  it('savedCarriesTheStoredSnapshot', async () => {
    const spring = fakeSpring()
    const port = await start(spring)
    const c = await join(port)
    typeIn(c.doc, 'abc')
    await until(() => c.messages.some((m) => m.type === 'saved'))
    const saved = c.messages.find((m) => m.type === 'saved')!
    expect(saved.revision).toBe(1)
    const snap = Y.decodeSnapshot(Buffer.from(saved.snap as string, 'base64'))
    expect(snap.sv.get(c.doc.clientID)).toBe(Y.decodeStateVector(Y.encodeStateVector(c.doc)).get(c.doc.clientID))
  })

  it('storeRetriesWithBackoff', async () => {
    const spring = fakeSpring()
    let fails = 3
    spring.storeImpl = async () => {
      if (fails-- > 0) throw new Error('spring down')
      return { revision: 1 }
    }
    const port = await start(spring, { debounce: 50, maxDebounce: 200, backoff: [100, 200, 300] })
    const c = await join(port)
    typeIn(c.doc, 'kept')
    await until(() => c.messages.some((m) => m.type === 'saved'), 3000)
    expect(c.messages.map((m) => m.type)).toEqual(['retrying', 'retrying', 'retrying', 'saved'])
    const gaps = spring.stores.slice(1).map((s, i) => s.at - spring.stores[i].at)
    expect(gaps[0]).toBeGreaterThanOrEqual(90)
    expect(gaps[1]).toBeGreaterThanOrEqual(190)
    expect(gaps[2]).toBeGreaterThanOrEqual(290)
    expect(spring.stores.at(-1)!.body.authors).toEqual(['u1']) // kept across the failures
  })

  // A deletion does not move the state vector: it must still be stored (review finding).
  it('aDeleteOnlyChangeIsStored', async () => {
    const spring = fakeSpring()
    const port = await start(spring)
    const c = await join(port)
    typeIn(c.doc, 'keep this, drop that')
    await until(() => spring.stores.length === 1)
    const group = c.doc.getXmlFragment('document-store').get(0) as Y.XmlElement
    const text = ((group.get(0) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlText
    text.delete(9, 11)
    await until(() => spring.stores.length === 2)
    expect(spring.stores[1].body.text).toBe('keep this')
    const saved = c.messages.filter((m) => m.type === 'saved').at(-1)!
    const snap = Y.decodeSnapshot(Buffer.from(saved.snap as string, 'base64'))
    expect(Y.equalSnapshots(snap, Y.snapshot(c.doc))).toBe(true)
  })

  it('aStoreSpringRefusesForGoodIsNotRetried', async () => {
    const spring = fakeSpring()
    spring.storeImpl = async () => {
      throw new RefusedError('store refused: 404')
    }
    const port = await start(spring, { debounce: 50, maxDebounce: 200, backoff: [20] })
    const c = await join(port)
    typeIn(c.doc, 'page was deleted meanwhile')
    await until(() => c.closes.includes(4403))
    await new Promise((r) => setTimeout(r, 200))
    expect(spring.stores).toHaveLength(1)
  })

  it('aTicketFromBeforeARestoreIsRefused', async () => {
    const port = await start(fakeSpring({ epoch: 2 }))
    const c = connect(port, 'n1', ticket({ epoch: 1 }))
    clients.push(c)
    expect(await c.failed).toBe('restored')
  })

  it('aNewerTicketReplacesAnOpenDocWhoseResetWasLost', async () => {
    const spring = fakeSpring({ epoch: 0 })
    const port = await start(spring)
    const old = await join(port, { userId: 'old' })
    spring.loaded = { ...spring.loaded, epoch: 1, state: null } // restored; the reset call never arrived
    const fresh = connect(port, 'n1', ticket({ userId: 'new', epoch: 1 }))
    clients.push(fresh)
    await fresh.synced
    await until(() => old.closes.includes(4409))
  })

  it('epochConflictDropsDoc', async () => {
    const spring = fakeSpring()
    spring.storeImpl = async () => {
      spring.loaded = { ...spring.loaded, epoch: 1 } // restored meanwhile
      throw new EpochError()
    }
    const port = await start(spring)
    const c = connect(port, 'n1', ticket())
    clients.push(c)
    await c.synced
    typeIn(c.doc, 'old lineage')
    await until(() => c.closes.includes(4409))
    expect(await c.failed).toBe('restored') // the reconnect with the old ticket is refused
    expect(spring.stores).toHaveLength(1)
  })

  it('revisionConflictMerges', async () => {
    const spring = fakeSpring()
    const other = new Y.Doc()
    Y.applyUpdate(other, Buffer.from(EMPTY_PAGE_STATE, 'base64'))
    typeIn(other, 'theirs ')
    let first = true
    spring.storeImpl = async (body) => {
      if (first) {
        first = false
        spring.loaded = { state: Y.encodeStateAsUpdate(other), revision: 5, epoch: 0 }
        throw new RevisionError()
      }
      return { revision: body.baseRevision + 1 }
    }
    const port = await start(spring)
    const c = await join(port)
    typeIn(c.doc, 'mine ')
    await until(() => spring.stores.length === 2)
    expect(spring.stores[1].body.baseRevision).toBe(5)
    expect(spring.stores[1].body.text).toContain('theirs')
    expect(spring.stores[1].body.text).toContain('mine')
  })
})
