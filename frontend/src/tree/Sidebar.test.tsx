import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

const api = vi.hoisted(() => ({ getMe: vi.fn(), getMyTeams: vi.fn(), getMySpaces: vi.fn() }))
vi.mock('../api/spaces', () => api)
vi.mock('../api/nodes', () => ({ getTree: vi.fn().mockResolvedValue([]), createNode: vi.fn(), moveNode: vi.fn() }))

const space = (id: string, name: string, teamId: string | null) => ({
  id, name, icon: null, ownerType: teamId ? 'TEAM' : 'USER', teamId, teamName: null, myRole: 'ADMIN',
})

function renderSidebar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Sidebar onSearch={() => {}} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
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
    renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'Collapse Requirements' }))

    expect(localStorage.getItem('kf.sidebar.space.s1')).toBe('0')
    expect(screen.queryByRole('button', { name: /New page in Requirements/ })).toBeNull()
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
})
