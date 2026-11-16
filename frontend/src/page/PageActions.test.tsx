import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeDetail } from '../api/nodes'
import { ConfirmHost } from '../ui/ConfirmDialog'
import { ToastHost } from '../ui/Toast'
import PageMenu from './PageMenu'

const api = vi.hoisted(() => ({
  getSubtreeCount: vi.fn(), trashNode: vi.fn(), archiveNode: vi.fn(), unarchiveNode: vi.fn(),
  lockNode: vi.fn(), unlockNode: vi.fn(), unpublishNode: vi.fn(), updateNode: vi.fn(), restoreBranch: vi.fn(),
}))
vi.mock('../api/nodes', () => api)

const NODE: NodeDetail = {
  id: 'n1', spaceId: 's1', parentId: null, title: 'Methodology', icon: null, tags: [], publishState: 'PUBLISHED', locked: false,
  lockedBy: null, status: 'ACTIVE', access: 'EDIT', canManage: true, breadcrumbs: [], createdBy: null, updatedBy: null, contentUpdatedAt: '',
}

beforeEach(() => {
  api.getSubtreeCount.mockResolvedValue({ count: 2 })
  api.trashNode.mockResolvedValue({ count: 2 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mount(node: NodeDetail, unsaved = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/p/n1']}>
        <ConfirmHost />
        <ToastHost />
        <Routes>
          <Route path="/p/:id" element={<PageMenu node={node} unsaved={unsaved} />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Page actions' }))

describe('page menu', () => {
  it('confirmShowsSubpageCount', async () => {
    mount(NODE)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move "Methodology" to trash?' })
    expect(dialog.textContent).toContain('This also moves its 2 sub-pages. You can restore them from the trash for 30 days.')
    expect(api.trashNode).not.toHaveBeenCalled() // nothing happens before the answer

    await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(api.trashNode).toHaveBeenCalledWith('n1'))
    expect(await screen.findByText('Home')).toBeTruthy() // the page is gone, so we leave it
  })

  // QA-33: trashing says what happened and can be undone.
  it('trashShowsAToastWithUndo', async () => {
    api.restoreBranch.mockResolvedValue({ movedToTop: false })
    mount(NODE)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText('Moved “Methodology” to trash')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.restoreBranch).toHaveBeenCalledWith('n1'))
    expect(await screen.findByRole('button', { name: 'Page actions' })).toBeTruthy() // back on the page
  })

  it('cancellingTheConfirmKeepsThePage', async () => {
    mount(NODE)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(api.trashNode).not.toHaveBeenCalled()
    expect(screen.queryByText('Home')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Page actions' }))
  })

  it('singularAndEmptyWording', async () => {
    api.getSubtreeCount.mockResolvedValue({ count: 0 })
    mount(NODE)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    expect((await screen.findByRole('dialog')).textContent).toContain('You can restore it from the trash for 30 days.')
  })

  it('menuIsHiddenFromPeopleWhoCannotManage', () => {
    mount({ ...NODE, canManage: false })
    expect(screen.queryByRole('button', { name: 'Page actions' })).toBeNull()
  })

  it('lockedPageOffersUnlockAndBlocksArchiveAndTrash', async () => {
    api.unlockNode.mockResolvedValue({ ...NODE, locked: false })
    mount({ ...NODE, locked: true, access: 'VIEW' })
    await openMenu()
    expect((screen.getByRole('menuitem', { name: /^Archive/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitem', { name: /^Move to trash/ }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unlock page' }))
    await waitFor(() => expect(api.unlockNode).toHaveBeenCalledWith('n1'))
  })

  it('doesNotTakeEditRightsAwayWhileChangesAreUnsaved', async () => {
    mount(NODE, true)
    await openMenu()
    for (const name of [/^Lock page/, /^Archive/, /^Move to trash/]) {
      expect((screen.getByRole('menuitem', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('archivedPageOffersUnarchiveOnly', async () => {
    api.unarchiveNode.mockResolvedValue({ movedToTop: false })
    mount({ ...NODE, status: 'ARCHIVED', access: 'VIEW' })
    await openMenu()
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Unarchive'])
  })

  it('unarchiveToTopShowsNotice', async () => {
    api.unarchiveNode.mockResolvedValue({ movedToTop: true })
    mount({ ...NODE, status: 'ARCHIVED', access: 'VIEW' })
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }))
    expect((await screen.findByText(/^This page was moved/)).textContent).toBe('This page was moved to the top level of its space, because its parent was deleted or is in the trash.')
  })

  it('plainUnarchiveShowsNoNotice', async () => {
    api.unarchiveNode.mockResolvedValue({ movedToTop: false })
    mount({ ...NODE, status: 'ARCHIVED', access: 'VIEW' })
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }))
    await waitFor(() => expect(api.unarchiveNode).toHaveBeenCalledWith('n1'))
    expect(screen.queryByText(/^This page was moved/)).toBeNull()
  })

  it('aRefusedActionShowsTheServersMessage', async () => {
    api.archiveNode.mockRejectedValue(new Error('This page is locked and read-only'))
    mount(NODE)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect((await screen.findByRole('alert')).textContent).toBe('This page is locked and read-only')
  })

  it('escapeClosesTheMenuAndReturnsFocus', async () => {
    mount(NODE)
    await openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    await act(async () => void (await userEvent.keyboard('{Escape}')))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Page actions' }))
  })
})
