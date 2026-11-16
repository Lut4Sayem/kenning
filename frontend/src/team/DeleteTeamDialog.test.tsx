import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeleteTeamDialog from './DeleteTeamDialog'

const api = vi.hoisted(() => ({ deleteTeam: vi.fn(), getTeamSummary: vi.fn() }))
vi.mock('../api/teams', async (orig) => ({ ...(await orig<object>()), ...api }))

function setup(onClose = vi.fn()) {
  const qc = new QueryClient()
  qc.setQueryData(['spaces'], [{ id: 's1', teamId: 't1' }, { id: 's2', teamId: 'other' }])
  qc.setQueryData(['tree', 's1'], [])
  qc.setQueryData(['tree', 's2'], [])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/teams/t1']}><Routes>
        <Route path="/teams/:id" element={<DeleteTeamDialog teamId="t1" name="Thesis Group" onClose={onClose} />} />
        <Route path="/" element={<p>home</p>} />
      </Routes></MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose, qc }
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('delete team dialog (QA-67)', () => {
  it('warnsCountsAndNeedsTheExactNameThenGoesHome', async () => {
    api.getTeamSummary.mockResolvedValue({ spaceCount: 2, pageCount: 14, memberCount: 3 })
    api.deleteTeam.mockResolvedValue(undefined)
    const { qc } = setup()
    expect(screen.getByText(/can’t be restored/).textContent).toContain('gone for good')
    expect(await screen.findByText('What will be deleted: 2 spaces, 14 pages, 3 members.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Delete team' }) as HTMLButtonElement
    await userEvent.type(screen.getByLabelText(/to confirm/), 'thesis group')
    expect(button.disabled).toBe(true)
    await userEvent.clear(screen.getByLabelText(/to confirm/))
    await userEvent.type(screen.getByLabelText(/to confirm/), 'Thesis Group')
    expect(button.disabled).toBe(false)
    await userEvent.click(button)
    expect(api.deleteTeam).toHaveBeenCalledWith('t1', 'Thesis Group')
    expect(await screen.findByText('home')).toBeTruthy()
    await vi.waitFor(() => expect(qc.getQueryData(['tree', 's1'])).toBeUndefined())
    expect(qc.getQueryData(['tree', 's2'])).toEqual([]) // another team's tree stays
  })

  it('showsTheServerMessageAndStaysOpen', async () => {
    api.getTeamSummary.mockResolvedValue({ spaceCount: 1, pageCount: 1, memberCount: 1 })
    api.deleteTeam.mockRejectedValue(new Error('Only a team admin can delete the team'))
    const { onClose } = setup()
    await userEvent.type(screen.getByLabelText(/to confirm/), 'Thesis Group')
    await userEvent.click(screen.getByRole('button', { name: 'Delete team' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only a team admin can delete the team')
    expect(onClose).not.toHaveBeenCalled()
  })
})
