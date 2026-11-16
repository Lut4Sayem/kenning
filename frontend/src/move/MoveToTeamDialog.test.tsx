import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MoveToTeamDialog from './MoveToTeamDialog'

const api = vi.hoisted(() => ({ getSubtreeCount: vi.fn(), getTree: vi.fn(), moveToTeam: vi.fn(), moveNode: vi.fn() }))
const spaces = vi.hoisted(() => ({ getMySpaces: vi.fn() }))
vi.mock('../api/nodes', () => api)
vi.mock('../api/spaces', () => spaces)
const toasts = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../ui/Toast', () => toasts)

const space = (id: string, name: string, role: string, teamId = 't1') =>
  ({ id, name, icon: null, ownerType: 'TEAM', teamId, teamName: 'CSE391 Team', myRole: role })
const row = (id: string, title: string, parentId: string | null, titleOnly = false) =>
  ({ id, parentId, rank: id, title, icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mount(onClose = vi.fn()) {
  api.getSubtreeCount.mockResolvedValue({ count: 3 })
  api.getTree.mockResolvedValue([row('a', 'Overview', null), row('b', 'Budget', null, true)])
  api.moveToTeam.mockResolvedValue({})
  spaces.getMySpaces.mockResolvedValue([
    { id: 'me', name: 'Private', icon: null, ownerType: 'USER', teamId: null, teamName: null, myRole: null },
    space('s1', 'Thesis', 'EDITOR'),
    space('s2', 'Read only', 'VIEWER'),
  ])
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MoveToTeamDialog node={{ id: 'n1', spaceId: 'me', title: 'Interview plan' }} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

describe('MoveToTeamDialog', () => {
  it('listsOnlyEditableParents', async () => {
    mount()
    expect((await screen.findByRole('radio', { name: 'Overview' })).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('radio', { name: "Budget (you can’t edit here)" }).hasAttribute('disabled')).toBe(true)
    // projects I can only view, and my private space, are not offered
    expect(screen.queryByRole('option', { name: 'Read only' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Private' })).toBeNull()
    expect(await screen.findByText('+ 3 sub-pages')).toBeTruthy()
  })

  // QA-13: there is no copy or duplicate yet, so the dialog must not offer one.
  it('doesNotPromiseACopy', async () => {
    mount()
    expect(await screen.findByText(/can’t be moved back to your private space/)).toBeTruthy()
    expect(screen.queryByText(/copy it/i)).toBeNull()
  })

  it('movesUnderTheChosenParent', async () => {
    const onClose = mount()
    await userEvent.click(await screen.findByRole('radio', { name: 'Overview' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to team' }))
    await waitFor(() => expect(api.moveToTeam).toHaveBeenCalledWith('n1', { spaceId: 's1', parentId: 'a' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('showsTheServerMessageWhenTheMoveFails', async () => {
    mount()
    api.moveToTeam.mockRejectedValue(new Error("You can't edit this space"))
    await userEvent.click(await screen.findByRole('radio', { name: 'Overview' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to team' }))
    expect((await screen.findByRole('alert')).textContent).toContain("You can't edit this space")
  })
})

// QA-12: "Move to…" moves a team page to another space of the same team, with its sub-pages.
describe('Move to… (within the team)', () => {
  function mountWithin() {
    api.getSubtreeCount.mockResolvedValue({ count: 1 })
    api.getTree.mockImplementation(async (sid: string) => sid === 's1'
      ? [row('n1', 'Methodology', null), row('c1', 'Sampling', 'n1'), row('x', 'Related work', null)]
      : [row('e1', 'Pilot', null)])
    api.moveNode.mockResolvedValue({})
    spaces.getMySpaces.mockResolvedValue([
      space('s1', 'Literature Review', 'EDITOR'),
      space('s2', 'Experiments', 'EDITOR'),
      space('o1', 'Other team space', 'ADMIN', 't2'),
    ])
    const onClose = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MoveToTeamDialog mode="space" node={{ id: 'n1', spaceId: 's1', title: 'Methodology' }} onClose={onClose} />
      </QueryClientProvider>,
    )
    return onClose
  }

  it('offersOnlyThisTeamsSpacesStartingOnAnotherOne', async () => {
    mountWithin()
    expect(await screen.findByRole('dialog', { name: 'Move “Methodology” to…' })).toBeTruthy()
    const select = await screen.findByRole('combobox', { name: 'Space' }) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('s2'))
    expect(screen.queryByRole('option', { name: 'Other team space' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Team' })).toBeNull()
    expect(await screen.findByRole('radio', { name: 'Pilot' })).toBeTruthy()
  })

  it('movesToTheChosenSpaceAndParent', async () => {
    const onClose = mountWithin()
    await userEvent.click(await screen.findByRole('radio', { name: 'Pilot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(api.moveNode).toHaveBeenCalledWith('n1', { parentId: 'e1', spaceId: 's2' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toasts.toast).toHaveBeenCalledWith('Moved “Methodology” to Experiments') // QA-61
  })

  it('inItsOwnSpaceThePageAndItsSubPagesAreNotParents', async () => {
    mountWithin()
    await screen.findByRole('option', { name: 'Literature Review' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Space' }), 's1')
    expect(await screen.findByRole('radio', { name: 'Related work' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Methodology' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Sampling' })).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Related work' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(api.moveNode).toHaveBeenCalledWith('n1', { parentId: 'x' })) // same space: no spaceId
  })
})
