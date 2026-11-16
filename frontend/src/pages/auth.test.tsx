import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import Login from './Login'
import Register from './Register'
import { safeNext } from './safeNext'
import { ToastHost } from '../ui/Toast'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), api: apiMock }))

const assign = vi.fn()

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/app/login', search: '', assign })
  // /api/me: not logged in
  apiMock.mockImplementation((path: string) => (path === '/api/me' ? Promise.reject(new ApiError(401, 'Unauthorized')) : Promise.resolve(null)))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  apiMock.mockReset()
  assign.mockReset()
})

describe('Login', () => {
  it('loginShowsServerErrorOnBadCredentials', async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.reject(path === '/api/me' ? new ApiError(401, 'Unauthorized') : new ApiError(401, 'Bad credentials')))
    render(<MemoryRouter><Login /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/don’t match/)
    expect(assign).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText('Password')) // QA-43: focus lands where the fix is typed
  })

  it('loginRedirectsToSafeNextOnly', async () => {
    render(<MemoryRouter initialEntries={['/login?next=//evil.com']}><Login /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/app/'))

    expect(safeNext('/app/p/1?x=1')).toBe('/app/p/1?x=1')
    expect(safeNext('https://evil.com/x')).toBe('/app/')
    expect(safeNext('/\\evil.com')).toBe('/app/')
    expect(safeNext('/app/login')).toBe('/app/')
  })
})

describe('invite links while logged out (QA-04)', () => {
  const next = '?next=' + encodeURIComponent('/app/join/abc')
  beforeEach(() => {
    apiMock.mockImplementation((path: string) => path === '/api/me' ? Promise.reject(new ApiError(401, 'Unauthorized'))
      : path === '/api/team-invites/abc' ? Promise.resolve({ teamName: 'CSE391 Thesis Group', memberCount: 4, invitedByName: 'Ayesha Rahman', hasPendingRequest: false, isMember: false, teamId: null })
      : Promise.resolve(null))
  })

  it('loginNamesTheTeamAndKeepsTheInviteThroughCreateAccount', async () => {
    render(<MemoryRouter initialEntries={['/login' + next]}><Login /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in to join CSE391 Thesis Group' })).toBeTruthy()
    expect(screen.getByText('4 members · invited by Ayesha Rahman')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/register' + next)
  })

  it('registerNamesTheTeamToo', async () => {
    render(<MemoryRouter initialEntries={['/register' + next]}><Register /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Create an account to join CSE391 Thesis Group' })).toBeTruthy()
  })

  it('aBrokenInviteLeavesThePlainLogin', async () => {
    apiMock.mockImplementation(() => Promise.reject(new ApiError(404, 'Invite code not found')))
    render(<MemoryRouter initialEntries={['/login' + next]}><Login /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeTruthy()
  })
})

describe('AuthLayout (D0)', () => {
  it('showsTheTaglineAndADecorativeStage', async () => {
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>)
    expect(screen.getByText('Your team’s knowledge, in one place.')).toBeTruthy()
    const stage = container.querySelector('[data-auth-stage]')!
    expect(stage.getAttribute('aria-hidden')).toBe('true')
    expect(stage.querySelector('a, button, input, [tabindex]')).toBeNull()
  })
})

describe('Register', () => {
  it('registerValidatesPasswordLength8', async () => {
    render(<MemoryRouter><Register /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Full name'), 'Ann')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), '1234567')
    await userEvent.type(screen.getByLabelText('Confirm password'), '1234567')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(apiMock).not.toHaveBeenCalledWith('/api/auth/register', expect.anything())
  })

  // QA-43: a bad email is caught in the form, and a taken email links to Log in.
  it('registerSaysWhenTheEmailIsNotAnEmailAndLinksToLogInWhenItIsTaken', async () => {
    render(<MemoryRouter><Register /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Full name'), 'Ann')
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), '12345678')
    await userEvent.type(screen.getByLabelText('Confirm password'), '12345678')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter an email like name@example.com.')).toBeTruthy()
    expect(apiMock).not.toHaveBeenCalledWith('/api/auth/register', expect.anything())

    apiMock.mockImplementation((path: string) => Promise.reject(path === '/api/me' ? new ApiError(401, 'Unauthorized') : new ApiError(409, 'taken')))
    await userEvent.clear(screen.getByLabelText('Email'))
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect((await screen.findByRole('link', { name: 'Log in instead' })).getAttribute('href')).toBe('/login')
  })

  it('registerSignsYouInAndGoesOnToTheSafeNextWithAWelcome', async () => { // QA-01: the invite survives sign-up
    render(
      <MemoryRouter initialEntries={['/register?next=' + encodeURIComponent('/app/join/abc')]}>
        <ToastHost />
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/join/:code" element={<p>join page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Full name'), 'Tanvir Ahmed')
    await userEvent.type(screen.getByLabelText('Email'), 't@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('join page')).toBeTruthy()
    expect(screen.getByText('Welcome to Kenning, Tanvir')).toBeTruthy()
  })
})
