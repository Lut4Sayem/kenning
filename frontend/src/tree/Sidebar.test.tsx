import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmHost } from '../ui/ConfirmDialog'
import Sidebar from './Sidebar'

const api = vi.hoisted(() => ({ getMe: vi.fn(), getMyTeams: vi.fn(), getMySpaces: vi.fn(), renameSpace: vi.fn(), deleteSpace: vi.fn() }))
vi.mock('../api/spaces', async (orig) => ({ ...(await orig<typeof import('../api/spaces')>()), ...api }))
const nodes = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn(), moveNode: vi.fn() }))
vi.mock('../api/nodes', () => nodes)
const teamsApi = vi.hoisted(() => ({ updateTeam: vi.fn(), leaveTeam: vi.fn(), getTeam: vi.fn() }))
vi.mock('../api/teams', async (orig) => ({ ...(await orig<typeof import('../api/teams')>()), ...teamsApi }))

const space = (id: string, name: string, teamId: string | null) => ({
  id, name, icon: null, ownerType: teamId ? 'TEAM' : 'USER', teamId, teamName: null, myRole: 'ADMIN',
})

const Where = () => <p data-testid="where">{useLocation().pathname}</p>

function renderSidebar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/teams/t2']}><Sidebar onSearch={() => {}} /><Where /><ConfirmHost /></MemoryRouter>
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
  Object.values(teamsApi).forEach((f) => f.mockReset())
})

describe('Sidebar', () => {
  it('aFingerTapOnTheTeamsLabelShowsItsNewTeamButton', async () => { // touch tablets in the docked layout have no hover
    renderSidebar()
    const row = (await screen.findByRole('button', { name: 'New team' })).closest('[data-row]')!
    row.dispatchEvent(Object.assign(new MouseEvent('pointerdown', { bubbles: true }), { pointerType: 'touch' }))
    expect(row.hasAttribute('data-touched')).toBe(true)
  })

  it('brandAtTheTopLinksHome', async () => {
    renderSidebar()
    const home = await screen.findByRole('link', { name: 'Kenning home' })
    expect(home.getAttribute('href')).toBe('/')
    expect(screen.getByRole('navigation').firstElementChild).toBe(home) // above the account switcher
  })

  it('searchButtonIsNamedSearchWithTheShortcutAsAHint', async () => {
    renderSidebar()
    // QA-51: the shortcut text made the name "Search Ctrl K"
    const search = await screen.findByRole('button', { name: 'Search' })
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+K')
  })

  it('listsEveryTeamWithItsSpacesAndThePrivateSpace', async () => {
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Thesis Group' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Robotics Club' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Requirements' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hardware' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Private' })).toBeTruthy()
  })

  it('teamAndSpaceNamesShowInFullAsATooltip', async () => { // they are cut with … when the sidebar is narrow
    renderSidebar()
    expect((await screen.findByRole('link', { name: 'Thesis Group' })).title).toBe('Thesis Group')
    expect(screen.getByRole('link', { name: 'Requirements' }).title).toBe('Requirements')
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
    expect(await screen.findByRole('treeitem', { name: 'Use cases' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Requirements' }))

    expect(localStorage.getItem('kf.sidebar.space.s1')).toBe('0')
    expect(screen.queryByRole('treeitem', { name: 'Use cases' })).toBeNull()
  })

  it('hasNoPerSpaceNewPageArchivedOrTrashRows', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })

    expect(screen.queryByRole('link', { name: 'Archived' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Trash' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
  })

  // QA-63: admins rename a team from its row's menu; other members only get Leave team there (QA-68).
  it('adminsCanRenameATeamFromItsRow', async () => {
    teamsApi.updateTeam.mockResolvedValue({ id: 't1', name: 'Thesis Lab' })
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Robotics Club' })) // EDITOR there
    expect(screen.queryByRole('menuitem', { name: 'Rename team' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete team' })).toBeNull()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Thesis Group' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename team' }))
    const field = await screen.findByLabelText('Team name') as HTMLInputElement
    expect(field.value).toBe('Thesis Group')
    await userEvent.clear(field)
    await userEvent.type(field, 'Thesis Lab')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(teamsApi.updateTeam).toHaveBeenCalledWith('t1', { teamName: 'Thesis Lab' }))
  })

  // The row "..." menu focuses its first item on open, arrow keys move between items, Esc returns focus to the button.
  it('newBoardCreatesBoard', async () => {
    nodes.createNode.mockResolvedValue({ id: 'b9' })
    renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'New board' }))
    expect(nodes.createNode).toHaveBeenCalledWith('s1', { parentId: null, type: 'BOARD' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/b/b9'))
  })

  it('rowMenuSupportsArrowKeys', async () => {
    api.getMySpaces.mockResolvedValue([{ ...space('s2', 'Hardware', 't2'), myRole: 'VIEWER' }])
    renderSidebar()
    const trigger = await screen.findByRole('button', { name: 'More actions for Hardware' })
    await userEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Archived' }))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Trash' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  // A team space is renamed in place from its row: Enter saves, Escape cancels; the private space and viewers get no Rename.
  it('aSpaceIsRenamedInPlaceFromItsRow', async () => {
    api.getMySpaces.mockResolvedValue([space('s1', 'Requirements', 't1'), { ...space('s2', 'Hardware', 't2'), myRole: 'VIEWER' }, space('p1', 'My drafts', null)])
    api.renameSpace.mockResolvedValue({ id: 's1', name: 'Specs' })
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    for (const other of ['Hardware', 'My drafts']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions for ${other}` }))
      expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull()
      await userEvent.keyboard('{Escape}')
    }
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    let field = await screen.findByLabelText('Space name') as HTMLInputElement
    expect(field.value).toBe('Requirements')
    await userEvent.type(field, 'Nope{Escape}')
    expect(screen.queryByLabelText('Space name')).toBeNull()
    expect(api.renameSpace).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    field = await screen.findByLabelText('Space name') as HTMLInputElement
    await userEvent.clear(field)
    await userEvent.type(field, 'Specs{Enter}')
    await waitFor(() => expect(api.renameSpace).toHaveBeenCalledWith('s1', 'Specs'))
    await waitFor(() => expect(screen.queryByLabelText('Space name')).toBeNull())
  })

  // Spaces have no trash: an admin deletes a space only when it is empty; the dialog says how many pages it holds.
  it('adminsDeleteAnEmptySpaceAfterAConfirm', async () => {
    api.getMySpaces.mockResolvedValue([space('s1', 'Requirements', 't1'), { ...space('s2', 'Hardware', 't2'), myRole: 'EDITOR' }, space('p1', 'My drafts', null)])
    api.deleteSpace.mockResolvedValue(null)
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    for (const other of ['Hardware', 'My drafts']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions for ${other}` }))
      expect(screen.queryByRole('menuitem', { name: 'Delete space' })).toBeNull()
      await userEvent.keyboard('{Escape}')
    }
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete space' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Delete “Requirements”?')
    expect(dialog.textContent).toContain('It holds no pages')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete space' }))
    await waitFor(() => expect(api.deleteSpace).toHaveBeenCalledWith('s1'))
  })

  it('aSpaceWithPagesIsNotDeletedAndTheDialogSaysHowMany', async () => {
    nodes.getTree.mockImplementation(async (id: string) => id === 's1'
      ? [{ id: 'a', parentId: null, rank: 'a', title: 'A', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false },
         { id: 'b', parentId: null, rank: 'b', title: 'B', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false }]
      : [])
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete space' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('“Requirements” still holds 2 pages')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open the space' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/s/s1'))
    expect(api.deleteSpace).not.toHaveBeenCalled()
  })

  // QA-68: any member leaves a team from its row's menu, after a confirm; then Home, and the team is gone.
  it('editorLeavesATeamFromItsRow', async () => {
    teamsApi.leaveTeam.mockResolvedValue(undefined)
    renderSidebar()
    await screen.findByRole('link', { name: 'Hardware' })
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Robotics Club' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave team' }))
    api.getMyTeams.mockResolvedValue([{ teamId: 't1', teamName: 'Thesis Group', role: 'ADMIN' }])
    api.getMySpaces.mockResolvedValue([space('s1', 'Requirements', 't1'), space('p1', 'My drafts', null)])
    await userEvent.click(await screen.findByRole('button', { name: 'Leave team' }))
    expect(teamsApi.leaveTeam).toHaveBeenCalledWith('t2')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Robotics Club' })).toBeNull())
  })

  // QA-68: the last admin is told what to do instead of being asked to confirm.
  it('lastAdminCannotLeave', async () => {
    teamsApi.getTeam.mockResolvedValue({ team: { id: 't1', name: 'Thesis Group' }, teamMembers: [{ userId: 'u1', role: 'ADMIN' }, { userId: 'u2', role: 'EDITOR' }] })
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Thesis Group' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave team' }))
    await waitFor(() => expect(teamsApi.getTeam).toHaveBeenCalledWith('t1'))
    expect(screen.queryByRole('button', { name: 'Leave team' })).toBeNull()
    expect(teamsApi.leaveTeam).not.toHaveBeenCalled()
  })

  // QA-47: Trash at the bottom of the sidebar: a team's trash or the private one.
  it('bottomTrashOpensAPickerOfEveryTeamAndPrivate', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: 'Requirements' })
    await userEvent.click(screen.getByRole('button', { name: 'Trash' }))
    const menu = screen.getByRole('menu', { name: 'Open the trash of' })
    expect(within(menu).getByRole('menuitem', { name: 'Thesis Group' }).getAttribute('href')).toBe('/teams/t1/trash')
    expect(within(menu).getByRole('menuitem', { name: 'Robotics Club' }).getAttribute('href')).toBe('/teams/t2/trash')
    expect(within(menu).getByRole('menuitem', { name: 'Private' }).getAttribute('href')).toBe('/s/p1/trash')
    expect(screen.queryByRole('link', { name: /Settings/ })).toBeNull()
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

  // The sidebar's new controls offer Page and Board.
  it.each([
    ['New in Requirements', 'Page', 's1', { parentId: null }, '/p/n9'],
    ['New in Requirements', 'Board', 's1', { parentId: null, type: 'BOARD' }, '/b/n9'],
    ['New private page or board', 'Board', 'p1', { parentId: null, type: 'BOARD' }, '/b/n9'],
  ])('%s offers %s', async (button, item, spaceId, body, url) => {
    api.getMySpaces.mockResolvedValue([space('s1', 'Requirements', 't1'), space('p1', 'My drafts', null)])
    nodes.createNode.mockResolvedValue({ id: 'n9' })
    renderSidebar()
    await screen.findByRole('button', { name: 'More actions for My drafts' })
    await userEvent.click(await screen.findByRole('button', { name: button }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Page', 'Board'])
    await userEvent.click(screen.getByRole('menuitem', { name: item }))
    expect(nodes.createNode).toHaveBeenCalledWith(spaceId, body)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(url))
  })

  it('plusOnASpaceRowCreatesAPageInThatSpaceAndOpensIt', async () => {
    nodes.createNode.mockResolvedValue({ id: 'new1' })
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'New in Requirements' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Page' }))

    expect(nodes.createNode).toHaveBeenCalledWith('s1', { parentId: null })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/new1'))
  })

  it('viewersGetNoNewPageSubPageOrMoveControls', async () => { // QA-37: the server would answer 403
    api.getMySpaces.mockResolvedValue([{ ...space('s1', 'Requirements', 't1'), myRole: 'VIEWER' }, space('s2', 'Hardware', 't2'), space('p1', 'My drafts', null)])
    nodes.getTree.mockImplementation((id: string) => Promise.resolve([{ id: `${id}-a`, parentId: null, title: `Page in ${id}`, rank: 'a', type: 'PAGE', publishState: 'PUBLISHED' }]))
    renderSidebar()
    expect(await screen.findByText('Page in s1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New in Requirements' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New sub-page under Page in s1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Drag to move Page in s1' })).toBeNull()
    expect(screen.getByRole('button', { name: 'More actions for Requirements' })).toBeTruthy() // Archived and Trash stay readable
    // editors and the owner of the private space keep them
    await screen.findByText('Page in s2')
    expect(screen.getByRole('button', { name: 'New in Hardware' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Drag to move Page in p1' })).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'New in My drafts' })).toBeTruthy()
  })

  it('theTeamsLabelHasANewTeamButtonThatOpensTheDialog', async () => {
    renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'New team' }))
    expect(screen.getByRole('dialog', { name: 'New team' })).toBeTruthy()
    expect(screen.getByLabelText('Team name')).toBeTruthy()
  })
})
