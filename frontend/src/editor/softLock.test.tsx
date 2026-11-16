import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import SoftLockBanner, { TakenOverBanner, useEditLock } from './SoftLockBanner'

const contentApi = vi.hoisted(() => ({ acquireEditLock: vi.fn(), releaseEditLock: vi.fn() }))
vi.mock('../api/content', () => contentApi)

const mine = { mine: true, holder: { id: 'me', name: 'Me' }, expiresAt: '' }
const rafi = { mine: false, holder: { id: 'u2', name: 'Rafi' }, expiresAt: '' }

const reload = vi.fn()
function Harness({ canEdit = true, saved = true }: { canEdit?: boolean; saved?: boolean }) {
  const lock = useEditLock('n1', canEdit)
  return (
    <>
      {lock.mode === 'blocked' && <SoftLockBanner holder={lock.holder} onReadOnly={lock.openReadOnly} onEditAnyway={lock.editAnyway} />}
      {lock.mode === 'taken' && <TakenOverBanner holder={lock.holder} saved={saved} onReload={reload} onTakeBack={lock.editAnyway} />}
      <p data-testid="mode">{lock.mode}</p>
      <p data-testid="reason">{lock.reason}</p>
    </>
  )
}
const mode = () => screen.getByTestId('mode').textContent
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  contentApi.releaseEditLock.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('soft lock', () => {
  it('showsBannerWhenOtherHolds', async () => {
    contentApi.acquireEditLock.mockResolvedValue(rafi)
    render(<Harness />)
    expect(mode()).toBe('checking') // not editable until the lock is answered
    await tick(0)

    expect(contentApi.acquireEditLock).toHaveBeenCalledWith('n1', false)
    expect(screen.getByRole('status').textContent).toContain('Rafi is editing right now.')
    expect(mode()).toBe('blocked')

    fireEvent.click(screen.getByRole('button', { name: 'Open read-only' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(mode()).toBe('readonly')
    await tick(60_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(1) // a reader neither forces nor heartbeats
  })

  it('editAnywayForces', async () => {
    contentApi.acquireEditLock.mockImplementation(async (_id: string, force: boolean) => (force ? mine : rafi))
    render(<Harness />)
    await tick(0)

    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }))
    await tick(0)
    expect(contentApi.acquireEditLock).toHaveBeenLastCalledWith('n1', true)
    expect(mode()).toBe('editing')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('heartbeatEvery20s', async () => {
    contentApi.acquireEditLock.mockResolvedValue(mine)
    const view = render(<Harness />)
    await tick(0)
    expect(mode()).toBe('editing')
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(1)

    await tick(19_999)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(2)
    await tick(20_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(3)
    expect(contentApi.acquireEditLock).toHaveBeenLastCalledWith('n1', false) // a heartbeat never forces

    view.unmount() // leaving the page releases the lock and stops the heartbeat
    expect(contentApi.releaseEditLock).toHaveBeenCalledWith('n1', false)
    await tick(60_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(3)
  })

  it('releasesWithARequestThatSurvivesTheTabClosing', async () => {
    contentApi.acquireEditLock.mockResolvedValue(mine)
    render(<Harness />)
    await tick(0)
    window.dispatchEvent(new Event('pagehide'))
    expect(contentApi.releaseEditLock).toHaveBeenCalledWith('n1', true)
  })

  // QA-27: the person who was editing is told plainly that someone took over, and that their changes are kept.
  it('someoneTakingOverMakesMeReadOnlyAndSaysSo', async () => {
    contentApi.acquireEditLock.mockResolvedValueOnce(mine).mockResolvedValue(rafi)
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('editing')
    await tick(20_000) // my heartbeat finds Rafi holding it
    expect(mode()).toBe('taken')
    expect(screen.getByRole('status').textContent).toContain('Rafi started editing too. Your view is now read-only; your last changes were saved.')
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()

    await tick(60_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(2) // no quiet grab back: the person decides
    expect(mode()).toBe('taken')
  })

  it('theTakenOverBannerOnlyClaimsSavedOnceItIs', async () => {
    contentApi.acquireEditLock.mockResolvedValueOnce(mine).mockResolvedValue(rafi)
    render(<Harness saved={false} />)
    await tick(20_000)
    expect(screen.getByRole('status').textContent).toContain('Your view is now read-only; saving your last changes…')
  })

  it('takeBackForcesTheLockAgain', async () => {
    contentApi.acquireEditLock.mockResolvedValueOnce(mine).mockResolvedValueOnce(rafi).mockResolvedValue(mine)
    render(<Harness />)
    await tick(20_000)
    expect(mode()).toBe('taken')
    fireEvent.click(screen.getByRole('button', { name: 'Take back' }))
    await tick(0)
    expect(contentApi.acquireEditLock).toHaveBeenLastCalledWith('n1', true)
    expect(mode()).toBe('editing')
  })

  it('viewersNeverAskForTheLock', async () => {
    const view = render(<Harness canEdit={false} />)
    await tick(60_000)
    view.unmount()
    expect(contentApi.acquireEditLock).not.toHaveBeenCalled()
    expect(contentApi.releaseEditLock).not.toHaveBeenCalled()
  })

  // Review finding 13: the banner used to stay forever, even after the other person had left.
  it('bannerRechecksEvery20sAndGoesAwayWhenTheLockIsFree', async () => {
    contentApi.acquireEditLock.mockResolvedValue(rafi)
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('blocked')

    await tick(20_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(2)
    expect(contentApi.acquireEditLock).toHaveBeenLastCalledWith('n1', false) // asking, never forcing
    expect(mode()).toBe('blocked')

    contentApi.acquireEditLock.mockResolvedValue(mine) // Rafi left; his lock is gone
    await tick(20_000)
    expect(mode()).toBe('editing')
    expect(screen.queryByRole('status')).toBeNull()
  })

  // Review finding 15: a refused lock check used to let the user type into a page that can't be saved.
  it('lockRefusedByTheServerMakesThePageReadOnly', async () => {
    contentApi.acquireEditLock.mockRejectedValue(new ApiError(403, 'Forbidden'))
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('denied')
    await tick(60_000)
    expect(contentApi.acquireEditLock).toHaveBeenCalledTimes(1)
  })

  it('losingEditRightsWhileEditingIsNoticedByTheHeartbeat', async () => {
    contentApi.acquireEditLock.mockResolvedValueOnce(mine).mockRejectedValue(new ApiError(403, 'Forbidden'))
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('editing')
    await tick(20_000)
    expect(mode()).toBe('denied')
  })

  it('aFailedLockCheckDoesNotBlockEditing', async () => {
    contentApi.acquireEditLock.mockRejectedValue(new Error('network'))
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('editing')
  })

  it('deniedKeepsTheServersMessage', async () => {
    // The page was trashed, archived or locked while open: the editor goes read-only (text stays), the reason is the server's.
    contentApi.acquireEditLock.mockResolvedValueOnce(mine).mockRejectedValue(new ApiError(404, 'This page is in the trash'))
    render(<Harness />)
    await tick(0)
    expect(mode()).toBe('editing')
    await tick(20_000) // next heartbeat
    expect(mode()).toBe('denied')
    expect(screen.getByTestId('reason').textContent).toBe('This page is in the trash')
  })
})
