import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceHome from './SpaceHome'

const nodes = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn() }))
vi.mock('../api/nodes', () => nodes)
const spaces = vi.hoisted(() => ({ getMySpaces: vi.fn() }))
vi.mock('../api/spaces', async (orig) => ({ ...(await orig<typeof import('../api/spaces')>()), ...spaces }))
vi.mock('../app/ShellSlots', () => ({ TopBar: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }))
const sp = (myRole: string) => [{ id: 's1', name: 'Experiments', icon: null, ownerType: 'TEAM', teamId: 't1', teamName: 'Thesis Group', myRole }]

const n = (id: string, parentId: string | null, rank: string) => ({ id, parentId, rank, title: id, icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false })

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/s/s1']}>
        <Routes>
          <Route path="/s/:spaceId" element={<SpaceHome />} />
          <Route path="/p/:id" element={<p>opened page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('space home', () => {
  it('opensTheFirstPage', async () => {
    nodes.getTree.mockResolvedValue([n('a', null, 'a0')])
    setup()
    expect(await screen.findByText('opened page')).toBeTruthy()
  })

  // QA-17: an empty space shows its name, the top bar and a New page button with one line of help.
  it('anEmptySpaceShowsItsNameTheTopBarAndNewPage', async () => {
    nodes.getTree.mockResolvedValue([])
    nodes.createNode.mockResolvedValue({ id: 'new' })
    spaces.getMySpaces.mockResolvedValue(sp('EDITOR'))
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Experiments' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Thesis Group')
    expect(screen.getByText(/No pages yet\. Write the first one/)).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'New page' })
    await userEvent.click(buttons[0])
    await waitFor(() => expect(nodes.createNode).toHaveBeenCalledWith('s1', { parentId: null }))
    expect(await screen.findByText('opened page')).toBeTruthy()
  })

  it('viewersGetNoNewPageButton', async () => {
    nodes.getTree.mockResolvedValue([])
    spaces.getMySpaces.mockResolvedValue(sp('VIEWER'))
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Experiments' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(screen.getByText(/An editor of Thesis Group can write the first one/)).toBeTruthy()
  })
})
