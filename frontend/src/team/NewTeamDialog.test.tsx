import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewTeamDialog from './NewTeamDialog'

const api = vi.hoisted(() => ({ createTeam: vi.fn() }))
vi.mock('../api/teams', () => api)

function setup(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><Routes>
        <Route path="/" element={<NewTeamDialog onClose={onClose} />} />
        <Route path="/teams/:id" element={<p>team page</p>} />
      </Routes></MemoryRouter>
    </QueryClientProvider>,
  )
  return onClose
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('new team dialog', () => {
  it('needsANameThenOpensTheNewTeam', async () => {
    api.createTeam.mockResolvedValue({ id: 't9' })
    setup()
    expect((screen.getByRole('button', { name: 'Create team' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Team name'), '  Beta ')
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }))
    expect(api.createTeam).toHaveBeenCalledWith('Beta', '')
    expect(await screen.findByText('team page')).toBeTruthy()
  })

  it('showsTheServerMessageAndStaysOpen', async () => {
    api.createTeam.mockRejectedValue(new Error('Team name already taken'))
    const onClose = setup()
    await userEvent.type(screen.getByLabelText('Team name'), 'Beta')
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Team name already taken')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancelClosesWithoutCreating', async () => {
    const onClose = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(api.createTeam).not.toHaveBeenCalled()
  })
})
