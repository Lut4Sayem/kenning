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
import { ToastHost } from '../ui/Toast'
import { ConfirmHost } from '../ui/ConfirmDialog'
import { StrictMode } from 'react'
import PageView from './PageView'

// jsdom has no matchMedia; Mantine asks it for the colour scheme. Nor layout; BlockNote's side menu asks on mouse moves.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
document.elementsFromPoint ??= () => []

const nodesApi = vi.hoisted(() => ({
  getNode: vi.fn(), updateNode: vi.fn(), publishNode: vi.fn(), unpublishNode: vi.fn(), getTrashed: vi.fn(), restoreBranch: vi.fn(),
  getSubtreeCount: vi.fn(), trashNode: vi.fn(), unarchiveNode: vi.fn(),
}))
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

function mount(entry: string | { pathname: string; state: unknown } = '/p/n1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const topbar = document.body.appendChild(document.createElement('header'))
  const view = render(
    <StrictMode>{/* like main.tsx: effects run, clean up and run again on mount */}
    <QueryClientProvider client={qc}>
      <SlotsContext.Provider value={{ topbar, details: null, detailsOpen: false, setDetailsOpen: () => {} }}>
        <MemoryRouter initialEntries={[entry]}>
          <ToastHost />
          <ConfirmHost />
          <Routes>
            <Route path="/p/:nodeId" element={<PageView />} />
            <Route path="/" element={<p>Home</p>} />
          </Routes>
        </MemoryRouter>
      </SlotsContext.Provider>
    </QueryClientProvider>
    </StrictMode>,
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

  // QA-53: no manual Try again needed once the connection is back.
  it('contentThatFailedOfflineLoadsByItselfWhenBackOnline', async () => {
    await clearPendingOf('u1')
    contentApi.getContent.mockRejectedValue(new TypeError('Failed to fetch'))
    const { view } = mount()
    expect((await screen.findByRole('alert')).textContent).toContain("Could not load this page’s content")
    contentApi.getContent.mockResolvedValue({ format: 'YJS_BLOCKNOTE_V1', state: '', revision: 0, contentEpoch: 0 })
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(editorDom(view.container)).not.toBeNull(), { timeout: 5000 })
  })

  // QA-35: one banner, with Unarchive right there for people who can.
  it('anArchivedPageSaysSoOnceWithUnarchive', async () => {
    nodesApi.getNode.mockResolvedValueOnce({ ...NODE, status: 'ARCHIVED', access: 'VIEW' }).mockResolvedValue(NODE)
    nodesApi.unarchiveNode.mockResolvedValue({ movedToTop: false })
    mount()
    expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.bn-editor')).not.toBeNull(), { timeout: 5000 })
    expect(screen.getAllByText(/archived and read-only/)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }))
    await waitFor(() => expect(nodesApi.unarchiveNode).toHaveBeenCalledWith('n1'))
    await waitFor(() => expect(screen.queryByText(/archived and read-only/)).toBeNull())
  })

  it('aViewerOfAnArchivedPageGetsNoUnarchive', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, status: 'ARCHIVED', access: 'VIEW', canManage: false })
    mount()
    expect(await screen.findByText(/archived and read-only/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull()
  })

  // QA-39: a Viewer sees why typing does nothing, also on a page that has content.
  it('aViewerSeesAViewOnlyTagInTheTopBar', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, access: 'VIEW', canManage: false })
    const { topbar } = mount()
    await waitFor(() => expect(topbar.textContent).toContain('View only'))
  })

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
      title: 'Attention notes', rootId: 'r1', rootTitle: 'Reading list', spaceId: 's1', by: { id: 'u2', name: 'Rafi' }, at: new Date().toISOString(), canRestore: true,
    })
    nodesApi.restoreBranch.mockResolvedValue({ movedToTop: false })
    spacesApi.getMySpaces.mockResolvedValue([{ id: 's1', name: 'Experiments', icon: null, ownerType: 'TEAM', teamId: 't1', teamName: 'Thesis Group', myRole: 'EDITOR' }])
    const { view, topbar } = mount()
    // QA-60: the page is named, and the top bar says where it lived
    expect((await screen.findByRole('heading', { name: '“Attention notes” is in the trash' }))).toBeTruthy()
    await waitFor(() => expect(topbar.textContent).toBe('Thesis GroupExperimentsAttention notes'))
    expect(view.container.textContent).toContain('“Reading list” and its sub-pages were moved to the trash by Rafi')
    expect(screen.queryByText('This page does not exist.')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the trash' }).getAttribute('href')).toBe('/s/s1/trash')
    fireEvent.click(screen.getByRole('button', { name: 'Restore “Reading list”' }))
    await waitFor(() => expect(nodesApi.restoreBranch).toHaveBeenCalledWith('r1'))
    expect(await screen.findByLabelText('Page title')).toBeTruthy() // the page opens again
  })

  it('aViewerSeesNoRestoreButton', async () => {
    nodesApi.getNode.mockRejectedValue(new ApiError(404, TRASHED))
    nodesApi.getTrashed.mockResolvedValue({ title: 'Plan', rootId: 'n1', rootTitle: 'Plan', spaceId: 's1', by: null, at: null, canRestore: false })
    mount()
    expect((await screen.findByRole('heading', { name: '“Plan” is in the trash' }))).toBeTruthy()
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

// QA-16: a page just made with New page opens with the caret in its title.
describe('a new page', () => {
  it('focusesTheTitle', async () => {
    mount({ pathname: '/p/n1', state: { isNew: true } })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Page title')))
  })

  it('anExistingPageDoesNotTakeFocus', async () => {
    mount()
    await screen.findByLabelText('Page title')
    await act(() => new Promise((r) => setTimeout(r, 300)))
    expect(document.activeElement).not.toBe(screen.getByLabelText('Page title'))
  })
})

// QA-26: Publish says what happened, with Undo.
describe('publish', () => {
  it('showsAToastNamingTheTeamWithUndo', async () => {
    const draft = { ...NODE, publishState: 'DRAFT' as const }
    nodesApi.getNode.mockResolvedValue(draft)
    nodesApi.publishNode.mockResolvedValue(NODE)
    nodesApi.unpublishNode.mockResolvedValue(draft)
    spacesApi.getMySpaces.mockResolvedValue([{ id: 's1', name: 'Experiments', icon: null, ownerType: 'TEAM', teamId: 't1', teamName: 'Thesis Group', myRole: 'EDITOR' }])
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Published to Thesis Group')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(nodesApi.unpublishNode).toHaveBeenCalledWith('n1'))
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeTruthy() // a draft again
  })
})

// QA-58: Undo after Move to trash reopened the page from the cache and saved an empty title over the real one.
describe('title autosave', () => {
  it('trashThenUndoNeverSendsATitleTheUserDidNotType', async () => {
    nodesApi.getSubtreeCount.mockResolvedValue({ count: 0 })
    nodesApi.trashNode.mockResolvedValue({ count: 0 })
    nodesApi.restoreBranch.mockResolvedValue({ movedToTop: false })
    nodesApi.updateNode.mockResolvedValue(NODE)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Page actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText('Home')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect((screen.getByLabelText('Page title') as HTMLTextAreaElement).value).toBe('Plan'))
    await act(() => new Promise((r) => setTimeout(r, 1500))) // past the 1 s title debounce
    expect(nodesApi.updateNode).not.toHaveBeenCalled()
  })

  // QA-65: a remount mid-edit (a dev hot reload) once saved "" over the real title.
  it('remountingAfterATitleEditOnlyEverSendsTheTypedTitle', async () => {
    nodesApi.updateNode.mockImplementation(async (id: string, body: { title: string }) => ({ ...NODE, id, title: body.title }))
    let answer!: (n: NodeDetail) => void
    const first = mount()
    const field = () => screen.getByLabelText('Page title') as HTMLTextAreaElement
    await waitFor(() => expect(field().value).toBe('Plan'))
    fireEvent.change(field(), { target: { value: 'Transformers' } })
    nodesApi.getNode.mockImplementation(() => new Promise((r) => (answer = r))) // the next mount waits for the server
    first.view.unmount()
    mount()
    await act(() => new Promise((r) => setTimeout(r, 1500)))
    await act(async () => answer({ ...NODE, title: 'Transformers' }))
    await act(() => new Promise((r) => setTimeout(r, 1500)))
    expect(nodesApi.updateNode.mock.calls).toEqual([['n1', { title: 'Transformers' }]])
  }, 15_000)

  it('aTitleTheUserEmptiedIsSaved', async () => {
    nodesApi.updateNode.mockImplementation(async (id: string, body: { title: string }) => ({ ...NODE, id, title: body.title }))
    mount()
    const field = () => screen.getByLabelText('Page title') as HTMLTextAreaElement
    await waitFor(() => expect(field().value).toBe('Plan'))
    fireEvent.change(field(), { target: { value: '' } })
    await waitFor(() => expect(nodesApi.updateNode).toHaveBeenCalledWith('n1', { title: '' }), { timeout: 3000 })
  })

  it('aPageOpenedFromTheCacheDoesNotSaveItsTitle', async () => {
    nodesApi.updateNode.mockResolvedValue(NODE)
    mount()
    await waitFor(() => expect((screen.getByLabelText('Page title') as HTMLTextAreaElement).value).toBe('Plan'))
    await act(() => new Promise((r) => setTimeout(r, 1500)))
    expect(nodesApi.updateNode).not.toHaveBeenCalled()
  })
})

// QA-64: a visible trash button in the top bar runs the same flow as the menu item.
describe('trash button in the top bar', () => {
  it('confirmsWithTheSubPageCountThenTrashesWithUndo', async () => {
    nodesApi.getSubtreeCount.mockResolvedValue({ count: 2 })
    nodesApi.trashNode.mockResolvedValue({ count: 2 })
    mount()
    const topbar = document.querySelector('body > header') as HTMLElement
    const button = await within(topbar).findByRole('button', { name: 'Move to trash' })
    expect(button.getAttribute('title')).toBe('Move to trash')
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Move "Plan" to trash?' })
    expect(dialog.textContent).toContain('This also moves its 2 sub-pages.')
    expect(nodesApi.trashNode).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(nodesApi.trashNode).toHaveBeenCalledWith('n1'))
    expect(await screen.findByText('Moved “Plan” to trash')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect(await screen.findByText('Home')).toBeTruthy()
  })

  it('isNotThereForPeopleWhoCannotEdit', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, access: 'VIEW', canManage: false })
    mount()
    expect(await screen.findByLabelText('Page title')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Move to trash' })).toBeNull()
  })

  it('isBlockedWhileThePageIsLocked', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, locked: true, access: 'VIEW' })
    mount()
    const topbar = document.querySelector('body > header') as HTMLElement
    const button = await within(topbar).findByRole('button', { name: 'Move to trash' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Unlock the page first')
  })
})
