import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import Recent from './Recent'

const api = vi.hoisted(() => ({
  getRecent: vi.fn(), getDrafts: vi.fn(), getMe: vi.fn(), getMySpaces: vi.fn(), createNode: vi.fn(),
}))
vi.mock('../api/search', () => ({ getRecent: api.getRecent }))
vi.mock('../api/home', () => ({ getDrafts: api.getDrafts }))
vi.mock('../api/spaces', () => ({ getMe: api.getMe, getMySpaces: api.getMySpaces }))
vi.mock('../api/nodes', () => ({ createNode: api.createNode }))
// The top bar lives in the shell; here it renders in place so the tests can see it.
vi.mock('../app/ShellSlots', () => ({ TopBar: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }))

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const hit = (i: number, over: object = {}) => ({
  type: 'PAGE', nodeId: `n${i}`, teamId: null, spaceId: 's1', spaceName: 'Requirements', title: `Page ${i}`, path: '', snippetHtml: '',
  tags: [], publishState: 'DRAFT', archived: false, teamName: 'CSE391', openedAt: ago(i * 60), ...over,
})

function setup(path = '/') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/recent" element={<Recent />} />
          <Route path="/p/:id" element={<p>page opened</p>} />
          <Route path="/search" element={<p>search page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.getMe.mockResolvedValue({ id: 'u1', fullName: 'Lutfur Sayem', email: 'l@example.test' })
  api.getMySpaces.mockResolvedValue([{ id: 'priv', name: 'Private', icon: null, ownerType: 'USER', teamId: null, teamName: null, myRole: null }])
  api.getRecent.mockResolvedValue([])
  api.getDrafts.mockResolvedValue({ items: [], total: 0 })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

describe('home', () => {
  it('greetsByFirstNameWithTheDateAndNoTeamNews', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0))
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Good morning, Lutfur' })).toBeTruthy()
    expect(screen.getByText('Sunday, 15 November')).toBeTruthy()
    expect(screen.queryByText(/activity/i)).toBeNull()
    expect(screen.queryByText(/My teams/i)).toBeNull()
  })

  it('greetsWithoutANameWhenTheAccountHasNone', async () => { // QA-50: older accounts were saved without a name
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0))
    api.getMe.mockResolvedValue({ id: 'u1', fullName: null, email: 'l@example.test' })
    setup()
    const h1 = await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(h1.textContent).toBe('Good morning')) // the loading skeleton has no text
  })

  it('showsAtMostSixCardsWithLocationAndTime', async () => {
    api.getRecent.mockResolvedValue([hit(1), hit(2, { teamName: null, spaceName: 'Private' }), ...[3, 4, 5, 6, 7, 8].map((i) => hit(i))])
    setup()
    const links = await screen.findAllByRole('link', { name: /Page/ })
    expect(links).toHaveLength(6)
    expect(links[0].getAttribute('href')).toBe('/p/n1')
    expect(within(links[0]).getByText('Requirements')).toBeTruthy()
    expect(within(links[0]).getByText('1h ago')).toBeTruthy()
    expect(within(links[1]).getByText('Private')).toBeTruthy() // personal pages say Private, not the space name
  })

  it('emptyRecentIsOneLine', async () => {
    setup()
    expect(await screen.findByText('Pages you open show up here.')).toBeTruthy()
  })

  it('draftsShowRowsCountAndViewAllOnlyWhenThereAreMore', async () => {
    const items = [1, 2, 3, 4, 5].map((i) => ({ nodeId: `d${i}`, title: `Draft ${i}`, spaceId: 's1', spaceName: 'Final report', teamName: 'CSE391', updatedAt: ago(i * 1440) }))
    api.getDrafts.mockResolvedValue({ items, total: 7 })
    setup()
    await screen.findAllByRole('link', { name: /Draft \d/ })
    const section = screen.getByRole('heading', { name: 'Your drafts' }).closest('section')!
    expect(within(section).getByText('7')).toBeTruthy()
    expect(within(section).getAllByRole('link', { name: /Draft \d/ })).toHaveLength(5)
    expect(within(section).getAllByText('Draft')).toHaveLength(5) // the pill
    expect(within(section).getAllByText('CSE391 · Final report')).toHaveLength(5)
    await userEvent.click(within(section).getByRole('link', { name: 'View all drafts →' }))
    expect(await screen.findByText('search page')).toBeTruthy()
  })

  it('noViewAllLinkWhenEverythingFits', async () => {
    api.getDrafts.mockResolvedValue({ items: [{ nodeId: 'd1', title: 'One', spaceId: 's1', spaceName: 'Docs', teamName: null, updatedAt: ago(5) }], total: 1 })
    setup()
    expect(await screen.findByRole('link', { name: /One/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull()
    expect(screen.getByText('Private')).toBeTruthy()
  })

  it('hidesDraftsWhenThereAreNone', async () => {
    setup()
    await screen.findByText('Pages you open show up here.')
    expect(screen.queryByRole('heading', { name: 'Your drafts' })).toBeNull()
  })

  it('newPageCreatesInMyPrivateSpaceAndOpensIt', async () => {
    api.createNode.mockResolvedValue({ id: 'new1' })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New page' }))
    expect(api.createNode).toHaveBeenCalledWith('priv', { parentId: null })
    expect(await screen.findByText('page opened')).toBeTruthy()
  })

  it('failedRecentOffersARetry', async () => {
    api.getRecent.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([hit(1)])
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Page 1/ })).toBeTruthy()
  })
})

describe('recent', () => {
  it('groupsByDayWithStatusPills', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 14, 0))
    api.getRecent.mockResolvedValue([hit(1, { publishState: 'PUBLISHED' }), hit(2, { openedAt: ago(30 * 60) }), hit(3, { openedAt: ago(5 * 24 * 60) })])
    setup('/recent')
    await screen.findByText('Published')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Recent')
    expect(screen.getByText('Pages you opened lately.')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Today', 'Yesterday', 'Earlier'])
    expect(screen.getByText('Published')).toBeTruthy()
    expect(screen.getAllByText('Draft')).toHaveLength(2)
  })

  it('emptyStatePointsHome', async () => {
    setup('/recent')
    await userEvent.click(await screen.findByRole('link', { name: 'Go to Home' }))
    expect(await screen.findByRole('heading', { name: /Good/ })).toBeTruthy()
  })
})
