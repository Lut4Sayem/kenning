import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import SpaceHome from '../page/SpaceHome'
import TagPage from '../page/TagPage'
import TeamDetails from '../team/TeamDetails'
import TeamPages from '../team/TeamPages'
import Markdown from '../ui/Markdown'

const row = { id: 'b1', title: 'Plan', type: 'BOARD', publishState: 'PUBLISHED', tags: [] }
vi.mock('../api/nodes', () => ({
  getTagged: async () => [{ ...row, spaceId: 's1', spaceName: 'Requirements' }],
  getTree: async () => [{ ...row, parentId: null, rank: 'a' }],
  createNode: vi.fn(),
}))
vi.mock('../api/spaces', () => ({ getMySpaces: async () => [], canEditSpace: () => false, canRenameSpace: () => false }))
vi.mock('../api/teams', () => ({
  getTeam: async () => ({ team: { id: 't1', name: 'T' }, teamMembers: [] }),
  getTeamPages: async () => ({ items: [{ ...row, spaceId: 's1', spaceName: 'Requirements', updatedAt: new Date().toISOString() }], total: 1 }),
  getTeamActivity: async () => [{ actorName: 'Rafi', action: 'CREATE_NODE', targetTitle: 'Plan', targetId: 'b1', type: 'BOARD', createdAt: new Date().toISOString() }],
}))

afterEach(cleanup)

const ctx = { teamId: 't1', canEdit: false, meId: 'u1', spacesLoaded: true, spaces: [{ id: 's1', name: 'Requirements' }] }

function mount(path: string, at: string, el: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route element={<Outlet context={ctx} />}><Route path={path} element={el} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// A board in any list links straight to /b/, not through the /p/ redirect.
it.each([
  ['space', '/s/:spaceId', '/s/s1', <SpaceHome />],
  ['tag', '/tags/:tag', '/tags/plan', <TagPage />],
  ['team pages', '/', '/', <TeamPages />],
  ['team activity', '/', '/', <TeamDetails teamId="t1" onClose={() => {}} />],
  ['AI source mark', '/', '/', <Markdown text="See [1]" sources={[{ n: 1, id: 'b1', title: 'Plan', type: 'BOARD' }]} />],
])('%s links a board to /b/', async (_, path, at, el) => {
  mount(path, at, el)
  const link = await screen.findByRole('link', { name: /Plan/ })
  expect(link.getAttribute('href')).toBe('/b/b1')
})
