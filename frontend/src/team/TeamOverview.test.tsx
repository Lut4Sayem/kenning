import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TeamLayout from './TeamLayout'
import TeamOverview from './TeamOverview'

const teams = vi.hoisted(() => ({
  getTeamSummary: vi.fn(), getTeamSpaces: vi.fn(), getJoinRequests: vi.fn(), getTeamPages: vi.fn(), getTeamActivity: vi.fn(),
  getTeam: vi.fn(), createTeamSpace: vi.fn(),
}))
const spacesApi = vi.hoisted(() => ({ getMe: vi.fn() }))
const nodes = vi.hoisted(() => ({ createNode: vi.fn() }))
vi.mock('../api/teams', () => teams)
vi.mock('../api/spaces', () => spacesApi)
vi.mock('../api/nodes', () => nodes)
const shell = vi.hoisted(() => ({ open: true, set: vi.fn() }))
// The shell's slots render in place so the tests can see them.
vi.mock('../app/ShellSlots', () => ({
  TopBar: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DetailsPanel: ({ children }: { children: React.ReactNode }) => <aside aria-label="Details">{children}</aside>,
  useShellSlots: () => ({ detailsOpen: shell.open, setDetailsOpen: shell.set }),
}))

const summary = (over = {}) => ({
  name: 'Thesis Group', description: 'Library room booking.', memberCount: 4, spaceCount: 2, pageCount: 9, myRole: 'ADMIN',
  updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  firstMembers: [{ userId: 'u1', fullName: 'Lutfur Sayem', role: 'ADMIN' }, { userId: 'u2', fullName: 'Rafi Ahmed', role: 'EDITOR' }], ...over,
})
const page = (i: number) => ({
  id: `p${i}`, title: `Page ${i}`, spaceId: 's1', spaceName: 'Requirements', publishState: i % 2 ? 'DRAFT' : 'PUBLISHED',
  lastEditorName: 'Rafi Ahmed', lastEditorId: 'u2', updatedAt: new Date(Date.now() - i * 3600_000).toISOString(), parentTitle: null,
})
const member = (i: number) => ({ userId: `m${i}`, fullName: `Member ${i}`, email: `m${i}@x`, role: 'EDITOR' })

function setup(path = '/teams/t1') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/teams/:teamId" element={<TeamLayout />}>
            <Route index element={<TeamOverview />} />
            <Route path="members" element={<p>members tab</p>} />
          </Route>
          <Route path="/p/:id" element={<p>page opened</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  shell.open = true
  spacesApi.getMe.mockResolvedValue({ id: 'u1', fullName: 'Lutfur Sayem', email: 'l@x' })
  teams.getTeamSummary.mockResolvedValue(summary())
  teams.getTeamSpaces.mockResolvedValue([
    { id: 's1', name: 'Requirements', description: null, pageCount: 5, draftCount: 3 },
    { id: 's2', name: 'Meeting notes', description: null, pageCount: 1, draftCount: 0 },
    { id: 's3', name: 'Empty one', description: null, pageCount: 0, draftCount: 0 },
  ])
  teams.getJoinRequests.mockResolvedValue([{ id: 'r1', fullName: 'Farhan', email: 'f@x', status: 'PENDING', requestedAt: '' }])
  teams.getTeamPages.mockResolvedValue({ items: [1, 2, 3].map(page), total: 3 })
  teams.getTeamActivity.mockResolvedValue([
    { actorName: 'Rafi Ahmed', action: 'CREATE_NODE', targetTitle: 'Use cases', targetId: 'p1', createdAt: new Date().toISOString() },
    { actorName: 'Nusrat Mim', action: 'TRASH_NODE', targetTitle: 'Scratch', targetId: 'p9', createdAt: new Date().toISOString() },
  ])
  teams.getTeam.mockResolvedValue({ team: { id: 't1', name: 'Thesis Group', description: null }, teamMembers: [1, 2, 3, 4, 5, 6, 7].map(member) })
  nodes.createNode.mockResolvedValue({ id: 'new1' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('team overview', () => {
  it('showsTheFactsSpacesRecentPagesAndTheRequestsCount', async () => {
    setup()
    expect((await screen.findByRole('heading', { level: 1, name: 'Thesis Group' })).textContent).toBe('Thesis Group')
    expect(screen.getByText('Library room booking.')).toBeTruthy()
    expect(screen.getByText('4 members')).toBeTruthy()
    expect(screen.getByText('9 pages', { exact: false })).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
    const spaces = (await screen.findByRole('heading', { name: 'Spaces' })).closest('section')!
    expect(within(spaces).getByText('5 pages · 3 drafts')).toBeTruthy()
    expect(within(spaces).getByText('1 page')).toBeTruthy()
    expect(within(spaces).getByText('No pages yet')).toBeTruthy()
    expect(await screen.findByRole('link', { name: /Page 1/ })).toBeTruthy()
    expect((await screen.findByLabelText('1 waiting')).textContent).toBe('1')
  })

  it('viewAllShowsOnlyWhenThereAreMoreThanEightPages', async () => {
    teams.getTeamPages.mockResolvedValue({ items: [1, 2, 3, 4, 5, 6, 7, 8].map(page), total: 21 })
    setup()
    expect((await screen.findByRole('link', { name: 'View all 21 pages →' })).getAttribute('href')).toBe('/teams/t1/pages')
  })

  it('detailsPanelListsFiveMembersWithMoreAndTheActivity', async () => {
    setup()
    const panel = await screen.findByRole('complementary', { name: 'Details' })
    expect(await within(panel).findByText('Member 5')).toBeTruthy()
    expect(within(panel).queryByText('Member 6')).toBeNull()
    expect(within(panel).getByRole('link', { name: '+ 2 more' }).getAttribute('href')).toBe('/teams/t1/members')
    expect(await within(panel).findByRole('link', { name: 'Use cases' })).toBeTruthy()
    expect(within(panel).getByText(/created/)).toBeTruthy()
    expect(within(panel).queryByRole('link', { name: 'Scratch' })).toBeNull() // trashed pages cannot be opened
  })

  it('adminsSeeInviteAndNewPage_andNewPageUsesTheFirstSpace', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New page' }))
    expect(nodes.createNode).toHaveBeenCalledWith('s1', { parentId: null })
    expect(await screen.findByText('page opened')).toBeTruthy()
  })

  it('viewersSeeNoAdminOrEditControlsAndDoNotCallJoinRequests', async () => {
    teams.getTeamSummary.mockResolvedValue(summary({ myRole: 'VIEWER' }))
    setup()
    await screen.findByRole('heading', { level: 1, name: 'Thesis Group' })
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(screen.queryByRole('button', { name: /New space/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Requests/ })).toBeNull()
    expect(teams.getJoinRequests).not.toHaveBeenCalled()
  })

  it('newSpaceOpensADialogAndCreatesIt', async () => {
    teams.createTeamSpace.mockResolvedValue({ id: 's9' })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /New space/ }))
    await userEvent.type(screen.getByLabelText('Space name'), 'Research')
    await userEvent.click(screen.getByRole('button', { name: 'Create space' }))
    expect(teams.createTeamSpace).toHaveBeenCalledWith('t1', 'Research', '')
  })

  it('detailsToggleIsPressedWhenOpenAndFlipsThePanel', async () => {
    setup()
    const toggle = await screen.findByRole('button', { name: 'Details' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(toggle)
    expect(shell.set).toHaveBeenCalledWith(false)
  })

  it('errorShowsTheServerMessageWithARetry', async () => {
    teams.getTeamSummary.mockRejectedValueOnce(new Error('You are not a member of this team')).mockResolvedValue(summary())
    setup()
    expect((await screen.findByRole('alert')).textContent).toContain('You are not a member of this team')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Thesis Group' })).toBeTruthy()
  })

  it('emptyTeamExplainsWhatGoesWhere', async () => {
    teams.getTeamSpaces.mockResolvedValue([])
    teams.getTeamPages.mockResolvedValue({ items: [], total: 0 })
    teams.getTeamActivity.mockResolvedValue([])
    setup()
    expect(await screen.findByText(/No spaces yet/)).toBeTruthy()
    expect(await screen.findByText(/No pages yet\. Pages created/)).toBeTruthy()
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy()
  })
})
