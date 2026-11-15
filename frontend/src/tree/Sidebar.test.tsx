import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

const api = vi.hoisted(() => ({ getMe: vi.fn(), getMyTeams: vi.fn(), getMySpaces: vi.fn() }))
vi.mock('../api/spaces', () => api)
const nodes = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn(), moveNode: vi.fn() }))
vi.mock('../api/nodes', () => nodes)

const space = (id: string, name: string, teamId: string | null) => ({
  id, name, icon: null, ownerType: teamId ? 'TEAM' : 'USER', teamId, teamName: null, myRole: 'ADMIN',
})

const Where = () => <p data-testid="where">{useLocation().pathname}</p>

function renderSidebar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Sidebar onSearch={() => {}} /><Where /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  nodes.getTree.mockResolvedValue([])
  api.getMe.mockResolvedValue({ id: 'u1', fullName: 'Lutfur Sayem', email: 'l@example.test' })
  api.getMyTeams.mockResolvedValue([
    { teamId: 't1', teamName: 'Thesis Group', role: 'ADMIN' },
    { teamId: 't2', teamName: 'Robotics Club', role: 'EDITOR' },
  ])
  api.getMySpaces.mockResolvedValue([space('s1', 'Requirements', 't1'), space('s2', 'Hardware', 't2'), space('p1', 'My drafts', null)])
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  Object.values(api).forEach((f) => f.mockReset())
  Object.values(nodes).forEach((f) => f.mockReset())
})

describe('Sidebar', () => {
  it('listsEveryTeamWithItsSpacesAndThePrivateSpace', async () => {
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Thesis Group' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Robotics Club' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Requirements' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hardware' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Private' })).toBeTruthy()
  })

  it('collapsingATeamHidesItsSpacesAndIsRemembered', async () => {
    const first = renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'Collapse Thesis Group' }))

    expect(screen.queryByRole('link', { name: 'Requirements' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Hardware' })).toBeTruthy() // other teams stay open

    first.unmount()
    renderSidebar()
    expect(await screen.findByRole('button', { name: 'Expand Thesis Group' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Requirements' })).toBeNull()
  })

  it('collapsingASpaceHidesItsPagesAndIsRemembered', async () => {
    nodes.getTree.mockImplementation((id: string) =>
      Promise.resolve(id === 's1' ? [{ id: 'a', parentId: null, rank: 'V', title: 'Use cases', icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false }] : []))
    renderSidebar()
    expect(await screen.findByRole('link', { name: 'Use cases' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Requirements' }))

    expect(localStorage.getItem('kf.sidebar.space.s1')).toBe('0')
    expect(screen.queryByRole('link', { name: 'Use cases' })).toBeNull()
  })

  it('hasNoPerSpaceNewPageArchivedOrTrashRows', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })

    expect(screen.queryByRole('link', { name: 'Archived' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Trash' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
  })

  it('doesNotShowInboxFavouritesOrBookmarksInRelease1a', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: 'Thesis Group' })

    for (const name of [/inbox/i, /favourites/i, /bookmarks/i]) expect(screen.queryByText(name)).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Recent' })).toBeTruthy()
  })

  it('accountMenuHasProfileAndLogOut', async () => {
    renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))

    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Account menu' }))
  })

  it('plusOnASpaceRowCreatesAPageInThatSpaceAndOpensIt', async () => {
    nodes.createNode.mockResolvedValue({ id: 'new1' })
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'New page in Requirements' }))

    expect(nodes.createNode).toHaveBeenCalledWith('s1', { parentId: null })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/new1'))
  })

  it('spaceMenuHasArchivedAndTrashAndEscReturnsFocus', async () => {
    renderSidebar()
    const more = await screen.findByRole('button', { name: 'More actions for Requirements' })
    await userEvent.click(more)

    expect(screen.getByRole('menuitem', { name: 'Archived' }).getAttribute('href')).toBe('/s/s1/trash?tab=archived')
    expect(screen.getByRole('menuitem', { name: 'Trash' }).getAttribute('href')).toBe('/s/s1/trash')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Requirements actions' })).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  it('privateSectionHasTheSameActions', async () => {
    renderSidebar()
    expect(await screen.findByRole('button', { name: 'More actions for My drafts' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New page in My drafts' })).toBeTruthy()
  })
})
