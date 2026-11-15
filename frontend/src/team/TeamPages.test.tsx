import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TeamPages from './TeamPages'
import type { TeamContext } from './TeamLayout'

const teams = vi.hoisted(() => ({ getTeamPages: vi.fn(), getTeam: vi.fn() }))
vi.mock('../api/teams', () => teams)
vi.mock('../api/nodes', () => ({ createNode: vi.fn().mockResolvedValue({ id: 'new' }) }))

const ctx: TeamContext = {
  teamId: 't1', admin: true, canEdit: true, meId: 'u1', spacesLoaded: true, requests: [], requestsLoaded: true, refetchRequests: async () => {},
  summary: { name: 'T', description: null, memberCount: 2, spaceCount: 2, pageCount: 4, myRole: 'ADMIN', updatedAt: null, firstMembers: [] },
  spaces: [{ id: 's1', name: 'Requirements', description: null, pageCount: 2, draftCount: 1 }, { id: 's2', name: 'Meetings', description: null, pageCount: 1, draftCount: 0 }],
}
const item = (id: string, title: string, spaceId: string, over = {}) => ({
  id, title, spaceId, spaceName: spaceId === 's1' ? 'Requirements' : 'Meetings', publishState: 'DRAFT', lastEditorName: 'Rafi Ahmed', lastEditorId: 'u2',
  updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), parentTitle: null, ...over,
})

const Where = () => <p data-testid="where">{useLocation().search}</p>
const Child = () => { useOutletContext<TeamContext>(); return <TeamPages /> }

function setup(path = '/teams/t1/pages') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<Outlet2 />}><Route path="/teams/:teamId/pages" element={<Child />} /></Route></Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
// Supplies the outlet context the layout would.
const Outlet2 = () => <Outlet context={ctx} />

beforeEach(() => {
  localStorage.clear()
  teams.getTeam.mockResolvedValue({ team: { id: 't1', name: 'T', description: null }, teamMembers: [{ userId: 'u1', fullName: 'Lutfur', email: 'l@x', role: 'ADMIN' }, { userId: 'u2', fullName: 'Rafi Ahmed', email: 'r@x', role: 'EDITOR' }] })
  teams.getTeamPages.mockResolvedValue({
    items: [item('p1', 'Use cases', 's1'), item('p2', 'Test plan', 's1', { parentTitle: 'Use cases', publishState: 'PUBLISHED' }), item('p3', 'Week 6', 's2')], total: 3,
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('team pages list', () => {
  it('groupsBySpaceWithCountsStatusEditorAndParent', async () => {
    setup()
    expect(await screen.findByRole('link', { name: 'Use cases' })).toBeTruthy()
    const heads = screen.getAllByRole('row').filter((r) => /Requirements|Meetings/.test(r.textContent ?? '') && within(r).queryByRole('button', { name: /Collapse/ }))
    expect(heads.map((h) => h.textContent)).toEqual(['Requirements2', 'Meetings1'])
    expect(screen.getByText('in Use cases')).toBeTruthy()
    expect(within(screen.getByRole('table')).getAllByText('Published')).toHaveLength(1)
    expect(screen.getAllByText('Rafi Ahmed')).toHaveLength(3)
    expect(screen.getByText('3 pages · grouped by space · sorted by last edited')).toBeTruthy()
  })

  it('viewsAndFiltersLiveInTheUrlAndReachTheApi', async () => {
    setup()
    await screen.findByRole('link', { name: 'Use cases' })
    await userEvent.click(screen.getByRole('button', { name: 'Drafts' }))
    expect(screen.getByTestId('where').textContent).toBe('?status=DRAFT')
    expect(teams.getTeamPages).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'DRAFT', page: 0, size: 25 }))
    await userEvent.click(screen.getByRole('button', { name: 'Edited by me' }))
    expect(screen.getByTestId('where').textContent).toBe('?editor=u1')
    expect(screen.getByRole('button', { name: 'Edited by me' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('aDeepLinkRestoresViewSpaceChipAndSort_andTheChipRemovesItself', async () => {
    setup('/teams/t1/pages?status=PUBLISHED&space=s2&sort=title&group=0')
    expect(await screen.findByText('Space is Meetings')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Published' }).getAttribute('aria-pressed')).toBe('true')
    expect(teams.getTeamPages).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'PUBLISHED', spaceId: 's2', sort: 'title' }))
    expect(await screen.findByText('3 pages · sorted by title')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Space is Meetings' }))
    expect(screen.getByTestId('where').textContent).toBe('?status=PUBLISHED&sort=title&group=0')
  })

  it('collapsingAGroupHidesItsRowsAndIsRemembered', async () => {
    setup()
    await screen.findByRole('link', { name: 'Use cases' })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Requirements' }))
    expect(screen.queryByRole('link', { name: 'Use cases' })).toBeNull()
    expect(localStorage.getItem('kf.team.group.s1')).toBe('0')
  })

  it('filteredEmptyOffersClearFilters_unfilteredEmptyExplains', async () => {
    teams.getTeamPages.mockResolvedValue({ items: [], total: 0 })
    setup('/teams/t1/pages?status=DRAFT')
    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))
    expect(screen.getByTestId('where').textContent).toBe('')
    expect(await screen.findByText(/No pages yet/)).toBeTruthy()
  })

  it('pagesTwentyFiveAtATimeWithPreviousAndNext', async () => {
    teams.getTeamPages.mockResolvedValue({ items: [item('p1', 'One', 's1')], total: 30 })
    setup('/teams/t1/pages?group=0')
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('where').textContent).toBe('?group=0&page=2')
    expect(teams.getTeamPages).toHaveBeenLastCalledWith('t1', expect.objectContaining({ page: 1 }))
  })

  it('errorShowsTheMessageAndRetries', async () => {
    teams.getTeamPages.mockRejectedValueOnce(new Error('Server error')).mockResolvedValue({ items: [item('p1', 'One', 's1')], total: 1 })
    setup()
    expect((await screen.findByRole('alert')).textContent).toContain('Server error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /One/ })).toBeTruthy()
  })
})
