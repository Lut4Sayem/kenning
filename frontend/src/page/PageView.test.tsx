import 'fake-indexeddb/auto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ApiError } from '../api/client'
import type { NodeDetail } from '../api/nodes'
import { toBase64 } from '../editor/base64'
import { clearPendingOf, pendingFor } from '../editor/pendingStore'
import { SlotsContext } from '../app/ShellSlots'
import PageView from './PageView'

// jsdom has no matchMedia; Mantine asks it for the colour scheme. Nor layout; BlockNote's side menu asks on mouse moves.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
document.elementsFromPoint ??= () => []

const nodesApi = vi.hoisted(() => ({ getNode: vi.fn(), updateNode: vi.fn(), publishNode: vi.fn(), getTrashed: vi.fn(), restoreBranch: vi.fn() }))
vi.mock('../api/nodes', () => nodesApi)
const spacesApi = vi.hoisted(() => ({ getMe: vi.fn(), getMySpaces: vi.fn() }))
vi.mock('../api/spaces', () => spacesApi)
const contentApi = vi.hoisted(() => ({ getContent: vi.fn(), saveContent: vi.fn(), saveRecovered: vi.fn(), acquireEditLock: vi.fn(), releaseEditLock: vi.fn() }))
vi.mock('../api/content', () => contentApi)

const NODE: NodeDetail = {
  id: 'n1', spaceId: 's1', parentId: null, title: 'Plan', icon: null, tags: [], publishState: 'PUBLISHED', locked: false,
  lockedBy: null, status: 'ACTIVE', access: 'EDIT', canManage: true, breadcrumbs: [], createdBy: null, updatedBy: null, contentUpdatedAt: '',
}
const TRASHED = 'This page is in the trash'

beforeEach(() => {
  nodesApi.getNode.mockResolvedValue(NODE)
  spacesApi.getMe.mockResolvedValue({ id: 'u1', fullName: 'Me', email: 'm@x.test' })
  spacesApi.getMySpaces.mockResolvedValue([])
  contentApi.getContent.mockResolvedValue({ format: 'YJS_BLOCKNOTE_V1', state: '', revision: 0, contentEpoch: 0 })
  contentApi.acquireEditLock.mockResolvedValue({ mine: true, holder: { id: 'u1', name: 'Me' }, expiresAt: '' })
  contentApi.releaseEditLock.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('body > header').forEach((h) => h.remove())
  vi.clearAllMocks()
})

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const topbar = document.body.appendChild(document.createElement('header'))
  const view = render(
    <QueryClientProvider client={qc}>
      <SlotsContext.Provider value={{ topbar, details: null, detailsOpen: false, setDetailsOpen: () => {} }}>
        <MemoryRouter initialEntries={['/p/n1']}>
          <Routes>
            <Route path="/p/:nodeId" element={<PageView />} />
          </Routes>
        </MemoryRouter>
      </SlotsContext.Provider>
    </QueryClientProvider>,
  )
  return { qc, view, topbar }
}
const editorDom = (c: HTMLElement) => c.querySelector('[contenteditable="true"]')

describe('an open page that is trashed, archived or locked meanwhile', () => {
  it('keepsTheEditorTheTextAndTheLocalCopyAndShowsTheServersMessage', async () => {
    // A copy typed earlier that the server never confirmed (what an interrupted session leaves behind).
    const unsaved = new Y.Doc()
    unsaved.getText('t').insert(0, 'typed before the page was trashed')
    await pendingFor('u1', 'n1').put('old-tab', { state: toBase64(Y.encodeStateAsUpdate(unsaved)), text: 'typed before the page was trashed', baseRevision: 0, epoch: 0, at: Date.now() })
    contentApi.saveContent.mockRejectedValue(new ApiError(404, TRASHED)) // the page was trashed by someone else

    const { qc, view } = mount()
    await waitFor(() => expect(editorDom(view.container)).not.toBeNull(), { timeout: 5000 })

    // The replayed copy is saved, the server refuses, and says why. The editor is still there.
    await waitFor(() => expect(screen.getByText(`Not saved: ${TRASHED}`)).toBeTruthy(), { timeout: 5000 })
    expect(editorDom(view.container)).not.toBeNull()
    const kept = Object.values(await pendingFor('u1', 'n1').all())
    expect(kept.length).toBeGreaterThan(0) // never dropped unsent
    expect(kept.some((p) => p.text.includes('typed before the page was trashed'))).toBe(true)

    // The page itself can no longer be read either: the message appears, the editor does not unmount.
    nodesApi.getNode.mockRejectedValue(new ApiError(404, TRASHED))
    await qc.invalidateQueries({ queryKey: ['node', 'n1'] })
    await waitFor(() => expect(screen.getAllByText(TRASHED).length).toBeGreaterThan(0))
    expect(screen.queryByText('This page does not exist.')).toBeNull()
    expect(editorDom(view.container)).not.toBeNull()
    expect(Object.values(await pendingFor('u1', 'n1').all()).length).toBeGreaterThan(0)
  }, 20_000)

  it('aPageThatNeverLoadedShowsOnlyTheError', async () => {
    nodesApi.getNode.mockRejectedValue(new ApiError(404, 'Page not found'))
    nodesApi.getTrashed.mockRejectedValue(new ApiError(404, 'Page not found'))
    const { view } = mount()
    expect((await screen.findByRole('alert')).textContent).toBe('This page does not exist.')
    expect(editorDom(view.container)).toBeNull()
  })

  // QA-33: a trashed page (or a sub-page of a trashed page) says so and offers Restore, not "does not exist".
  it('aTrashedPageSaysSoAndRestoresItsBranch', async () => {
    nodesApi.getNode.mockRejectedValueOnce(new ApiError(404, TRASHED)).mockResolvedValue(NODE)
    nodesApi.getTrashed.mockResolvedValue({
      rootId: 'r1', rootTitle: 'Reading list', spaceId: 's1', by: { id: 'u2', name: 'Rafi' }, at: new Date().toISOString(), canRestore: true,
    })
    nodesApi.restoreBranch.mockResolvedValue({ movedToTop: false })
    const { view } = mount()
    expect((await screen.findByRole('heading', { name: 'This page is in the trash' }))).toBeTruthy()
    expect(view.container.textContent).toContain('“Reading list” and its sub-pages were moved to the trash by Rafi')
    expect(screen.queryByText('This page does not exist.')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the trash' }).getAttribute('href')).toBe('/s/s1/trash')
    fireEvent.click(screen.getByRole('button', { name: 'Restore “Reading list”' }))
    await waitFor(() => expect(nodesApi.restoreBranch).toHaveBeenCalledWith('r1'))
    expect(await screen.findByLabelText('Page title')).toBeTruthy() // the page opens again
  })

  it('aViewerSeesNoRestoreButton', async () => {
    nodesApi.getNode.mockRejectedValue(new ApiError(404, TRASHED))
    nodesApi.getTrashed.mockResolvedValue({ rootId: 'n1', rootTitle: 'Plan', spaceId: 's1', by: null, at: null, canRestore: false })
    mount()
    expect((await screen.findByRole('heading', { name: 'This page is in the trash' }))).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull()
  })
})

// QA-11: the title is saved like the content, and nothing says "Saved" while it is not.
describe('page title', () => {
  const titleField = () => screen.getByLabelText('Page title') as HTMLInputElement
  const leaving = () => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  }
  async function open() {
    await clearPendingOf('u1')
    contentApi.saveContent.mockResolvedValue({ revision: 1, savedAt: '' })
    nodesApi.updateNode.mockImplementation(async (id: string, body: { title: string }) => ({ ...NODE, id, title: body.title }))
    const m = mount()
    await waitFor(() => expect(within(m.topbar).getByRole('status').textContent).toBe('Saved'), { timeout: 5000 })
    return m
  }

  it('savesAfterTypingStopsWithoutLeavingTheFieldAndSaysSavingUntilThen', async () => {
    const { topbar } = await open()
    fireEvent.change(titleField(), { target: { value: 'Transformers' } })
    expect(within(topbar).getByRole('status').textContent).toBe('Saving…')
    expect(leaving()).toBe(true) // closing the tab now asks first
    await waitFor(() => expect(nodesApi.updateNode).toHaveBeenCalledWith('n1', { title: 'Transformers' }), { timeout: 3000 })
    await waitFor(() => expect(within(topbar).getByRole('status').textContent).toBe('Saved'))
    expect(leaving()).toBe(false)
    expect(nodesApi.updateNode).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('leavingThePageSavesATitleThatWasStillWaiting', async () => {
    const { view } = await open()
    fireEvent.change(titleField(), { target: { value: 'Left quickly' } })
    view.unmount()
    await waitFor(() => expect(nodesApi.updateNode).toHaveBeenCalledWith('n1', { title: 'Left quickly' }))
  }, 15_000)

  it('typingWhileASaveIsOnTheWayIsKept', async () => {
    await open()
    let answer!: () => void
    nodesApi.updateNode.mockImplementationOnce((id: string, body: { title: string }) => new Promise((r) => (answer = () => r({ ...NODE, id, title: body.title }))))
    fireEvent.change(titleField(), { target: { value: 'Trans' } })
    await waitFor(() => expect(nodesApi.updateNode).toHaveBeenCalledWith('n1', { title: 'Trans' }), { timeout: 3000 })
    fireEvent.change(titleField(), { target: { value: 'Transformers' } })
    await act(async () => answer())
    expect(titleField().value).toBe('Transformers')
    await waitFor(() => expect(nodesApi.updateNode).toHaveBeenLastCalledWith('n1', { title: 'Transformers' }), { timeout: 3000 })
  }, 15_000)
})
