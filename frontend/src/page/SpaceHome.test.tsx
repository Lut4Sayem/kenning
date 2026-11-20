import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceHome from './SpaceHome'

const nodes = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn() }))
vi.mock('../api/nodes', () => nodes)
const spaces = vi.hoisted(() => ({ getMySpaces: vi.fn(), renameSpace: vi.fn() }))
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
  // A space click opens the space's own page: its pages, in tree order, each a link; nothing opens by itself.
  it('listsItsPagesInTreeOrderInsteadOfOpeningTheFirst', async () => {
    nodes.getTree.mockResolvedValue([n('b', null, 'b0'), n('a1', 'a', 'a0'), n('a', null, 'a0')])
    spaces.getMySpaces.mockResolvedValue(sp('VIEWER'))
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Experiments' })).toBeTruthy()
    const list = screen.getByRole('list', { name: 'Pages in Experiments' })
    expect([...list.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/p/a', '/p/a1', '/p/b'])
    expect(list.textContent).toContain('in a')
    expect(screen.queryByText('opened page')).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: /^b/ }))
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
    expect(buttons).toHaveLength(1) // QA-62: only the one in the body
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

  // Admins and editors rename the space from its title; viewers see plain text.
  it('editorsRenameTheSpaceFromItsTitle', async () => {
    nodes.getTree.mockResolvedValue([])
    spaces.getMySpaces.mockResolvedValue(sp('EDITOR'))
    spaces.renameSpace.mockRejectedValueOnce(new Error('A space needs a name')).mockResolvedValue({ id: 's1', name: 'Lab' })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Rename space: Experiments' }))
    const field = screen.getByLabelText('Space name')
    await userEvent.clear(field)
    await userEvent.type(field, '{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe('A space needs a name') // the field stays open
    await userEvent.type(field, 'Lab{Enter}')
    await waitFor(() => expect(spaces.renameSpace).toHaveBeenLastCalledWith('s1', 'Lab'))
  })

  it('viewersCannotRenameTheSpace', async () => {
    nodes.getTree.mockResolvedValue([])
    spaces.getMySpaces.mockResolvedValue(sp('VIEWER'))
    setup()
    await screen.findByRole('heading', { level: 1, name: 'Experiments' })
    expect(screen.queryByRole('button', { name: /Rename space/ })).toBeNull()
  })
})
