import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmHost } from '../ui/ConfirmDialog'
import type { TeamContext } from './TeamLayout'
import TeamMembers, { TeamRequests } from './TeamMembers'

const teams = vi.hoisted(() => ({
  getTeam: vi.fn(), setRole: vi.fn(), removeMember: vi.fn(), answerJoinRequest: vi.fn(), createInvite: vi.fn(),
  getInvite: vi.fn(), turnOffInvite: vi.fn(),
}))
vi.mock('../api/teams', () => teams)

const members = [
  { userId: 'u1', fullName: 'Ada', email: 'a@x', role: 'ADMIN' },
  { userId: 'u2', fullName: 'Bob', email: 'b@x', role: 'EDITOR' },
  { userId: 'u3', fullName: 'Cleo', email: 'c@x', role: 'VIEWER' },
]
const refetchRequests = vi.fn().mockResolvedValue(undefined)
const request = () => ({ id: 'r1', fullName: 'Cy', email: 'c@x', status: 'PENDING', requestedAt: new Date(Date.now() - 3 * 3600_000).toISOString() })

function ctx(meId: string, role: string, requests: TeamContext['requests']): TeamContext {
  return {
    teamId: 't1', admin: role === 'ADMIN', canEdit: role !== 'VIEWER', meId, spacesLoaded: true, spaces: [], requests, requestsLoaded: true, refetchRequests,
    summary: { name: 'T', description: null, memberCount: 3, spaceCount: 0, pageCount: 0, myRole: role, updatedAt: null, firstMembers: [] },
  }
}

function setup(meId: string, role = 'ADMIN', path = '/teams/t1/members', requests: TeamContext['requests'] = [request()]) {
  teams.getTeam.mockResolvedValue({ team: { id: 't1', name: 'T', description: null }, teamMembers: members })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConfirmHost />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={ctx(meId, role, requests)} />}>
            <Route path="/teams/:teamId/members" element={<TeamMembers />} />
            <Route path="/teams/:teamId/requests" element={<TeamRequests />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  teams.setRole.mockResolvedValue({})
  teams.removeMember.mockResolvedValue(null)
  teams.answerJoinRequest.mockResolvedValue({})
  teams.createInvite.mockResolvedValue({ inviteCode: 'abc', createdAt: new Date().toISOString(), createdByName: 'Ada' })
  teams.getInvite.mockResolvedValue(null)
  teams.turnOffInvite.mockResolvedValue(null)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('team members', () => {
  it('adminCanRemoveAMemberAfterConfirmingButNotThemselves', async () => {
    setup('u1')
    expect(await screen.findByText('Ada (you)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Ada' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Role of Ada/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bob' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove member' }))
    expect(teams.removeMember).toHaveBeenCalledWith('t1', 'u2')
  })

  it('makingAnAdminAsksFirstAndCancelChangesNothing', async () => {
    setup('u1')
    await userEvent.click(await screen.findByRole('button', { name: /Role of Bob/ }))
    await userEvent.click(within(screen.getByRole('group', { name: /Role of Bob/ })).getByRole('button', { name: 'Admin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(teams.setRole).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Role of Bob/ }))
    await userEvent.click(within(screen.getByRole('group', { name: /Role of Bob/ })).getByRole('button', { name: 'Viewer' }))
    expect(teams.setRole).toHaveBeenCalledWith('t1', 'u2', 'VIEWER')
  })

  it('roleMenuClosesWithEscAndReturnsFocus', async () => {
    setup('u1')
    const btn = await screen.findByRole('button', { name: /Role of Bob/ })
    await userEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /Role of Bob/ })).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('findAMemberFiltersByNameOrEmail', async () => {
    setup('u1')
    await userEvent.type(await screen.findByPlaceholderText('Find a member'), 'cle')
    expect(screen.getByText('Cleo')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    await userEvent.clear(screen.getByPlaceholderText('Find a member'))
    await userEvent.type(screen.getByPlaceholderText('Find a member'), 'nobody')
    expect(screen.getByText('No member matches "nobody".')).toBeTruthy()
  })

  it('adminAcceptsRequests_andDoubleClickAnswersOnce', async () => {
    setup('u1')
    let finish: () => void = () => {}
    teams.answerJoinRequest.mockReturnValue(new Promise<void>((r) => { finish = r }))
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Accept Cy' }))
    expect(teams.answerJoinRequest).toHaveBeenCalledTimes(1)
    expect(teams.answerJoinRequest).toHaveBeenCalledWith('t1', 'r1', true)
    expect((screen.getByRole('button', { name: 'Decline Cy' }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    expect(await screen.findByText('asked 3 hours ago')).toBeTruthy()
  })

  it('inviteStartsWithCreateLinkThenShowsAnAppJoinLinkWithCopy', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    setup('u1')
    expect(screen.queryByRole('textbox', { name: 'Invite link address' })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Create link' }))
    expect(((await screen.findByRole('textbox', { name: 'Invite link address' })) as HTMLInputElement).value).toBe(`${location.origin}/app/join/abc`)
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith(`${location.origin}/app/join/abc`)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('inviteShowsTheTeamsLinkAfterAReloadWithWhoAndWhen_andAnAdminCanTurnItOff', async () => { // QA-03
    teams.getInvite.mockResolvedValue({ inviteCode: 'old', createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(), createdByName: 'Ada' })
    setup('u1')
    expect(((await screen.findByRole('textbox', { name: 'Invite link address' })) as HTMLInputElement).value).toBe(`${location.origin}/app/join/old`)
    expect(screen.getByText('Created by Ada 2 hours ago')).toBeTruthy()
    expect(screen.getByText(/The old link stops working/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Turn off link' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
    expect(teams.turnOffInvite).toHaveBeenCalledWith('t1')
    expect(await screen.findByRole('button', { name: 'Create link' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Invite link address' })).toBeNull()
  })

  it('viewersSeeTheListOnly', async () => {
    setup('u3', 'VIEWER')
    await screen.findByText('Cleo (you)')
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Role of/ })).toBeNull()
    expect(screen.queryByText('Join requests')).toBeNull()
    expect(screen.queryByText('Invite link')).toBeNull()
  })

  it('requestsTabShowsTheEmptyLine_andSendsNonAdminsBack', async () => {
    setup('u1', 'ADMIN', '/teams/t1/requests', [])
    expect(await screen.findByText('No one is waiting to join.')).toBeTruthy()
    cleanup()
    setup('u3', 'VIEWER', '/teams/t1/requests')
    expect(await screen.findByRole('heading', { name: 'Members' })).toBeTruthy()
  })
})
