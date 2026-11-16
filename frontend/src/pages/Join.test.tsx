import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import Join from './Join'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), api: apiMock }))

const assign = vi.fn()
const ME = { fullName: 'Rafi Ahmed', email: 'rafi@bracu.ac.bd' }
const PREVIEW = { teamName: 'CSE391 Thesis Group', memberCount: 4, invitedByName: 'Lutfur Sayem' }

/** Answers by path: GET /api/me, GET /api/team-invites/abc, POST .../join. */
function backend(over: { preview?: unknown; join?: unknown } = {}) {
  apiMock.mockImplementation((path: string, init?: { method?: string }) => {
    const settle = (v: unknown) => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v))
    if (path === '/api/me') return Promise.resolve(ME)
    if (init?.method === 'POST') return settle('join' in over ? over.join : {})
    return settle('preview' in over ? over.preview : PREVIEW)
  })
}

/** The h1 changes once the load settles, so wait for the text instead of taking the first heading. */
const h1Is = (text: string) => waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(text))

const renderJoin = () =>
  render(<MemoryRouter initialEntries={['/join/abc']}><Routes><Route path="/join/:code" element={<Join />} /></Routes></MemoryRouter>)

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/app/join/abc', search: '', assign })
  backend()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  apiMock.mockReset()
  assign.mockReset()
})

describe('Join', () => {
  it('showsTheTeamAndWhoInvited', async () => {
    renderJoin()
    expect(await screen.findByText('CSE391 Thesis Group')).toBeTruthy()
    expect(screen.getByText('4 members · invited by Lutfur Sayem')).toBeTruthy()
    await h1Is('Join this team')
    expect(screen.getByText('rafi@bracu.ac.bd')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Not you?' }).getAttribute('href')).toBe('/logout?next=' + encodeURIComponent('/app/join/abc'))
  })

  it('usesSingularAndLeavesOutAMissingInviter', async () => {
    backend({ preview: { teamName: 'Solo', memberCount: 1, invitedByName: null } })
    renderJoin()
    expect(await screen.findByText('1 member')).toBeTruthy()
  })

  it('previewFailureKeepsTheButton', async () => {
    backend({ preview: new ApiError(500, 'boom') })
    renderJoin()
    await h1Is('Join a team')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask to join' })).toBeTruthy())
  })

  it('unknownInviteShowsNoButtonAndALinkHome', async () => {
    backend({ preview: new ApiError(404, 'Invite code not found') })
    renderJoin()
    await h1Is('This invite doesn’t work')
    expect(screen.getByRole('alert').textContent).toMatch(/ask for a new link/)
    expect(screen.queryByRole('button', { name: 'Ask to join' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to Home' }).getAttribute('href')).toBe('/')
  })

  it('sendingTheRequestReplacesTheButtonWithANotice', async () => {
    renderJoin()
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to join' }))
    expect((await screen.findByRole('status')).textContent).toBe('Request sent. A team admin has to approve it.')
    expect(screen.queryByRole('button', { name: 'Ask to join' })).toBeNull()
  })

  it('alreadyAskedShowsTheWaitingNotice', async () => {
    backend({ join: new ApiError(409, 'You are already invited') })
    renderJoin()
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to join' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/already asked/)
  })

  // QA-05: a reload must not bring "Ask to join" back after the request was sent.
  it('aRequestSentEarlierIsShownAsWaitingOnOpen', async () => {
    backend({ preview: { ...PREVIEW, hasPendingRequest: true } })
    renderJoin()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe("You've already asked to join. It's waiting for approval."))
    expect(screen.queryByRole('button', { name: 'Ask to join' })).toBeNull()
  })

  it('alreadyAMemberRedirectsAfterTheMessage', async () => {
    backend({ join: new ApiError(409, 'You are already a member of this team') })
    renderJoin()
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to join' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/already a member/)
    expect(assign).not.toHaveBeenCalled()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/app/'), { timeout: 2500 })
  })

  it('aReplacedInviteAtJoinTimeShowsTheDeadInviteState', async () => {
    backend({ join: new ApiError(404, 'Invite code not found') })
    renderJoin()
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to join' }))
    await h1Is('This invite doesn’t work')
  })
})
