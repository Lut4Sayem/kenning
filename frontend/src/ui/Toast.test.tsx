import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { toast, ToastHost } from './Toast'

afterEach(cleanup)

describe('toast', () => {
  it('showsTheMessageInTheLiveRegionAndCanBeDismissed', () => {
    render(<ToastHost />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite') // there before any message, so it is read out
    act(() => toast('Could not log out.', 'error'))
    expect(region.textContent).toContain('Could not log out.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(region.textContent).toBe('')
  })

  it('runsItsActionOnceAndCloses', () => { // Undo after Decline (QA-06)
    render(<ToastHost />)
    let undone = 0
    act(() => toast('Declined Farhan', 'info', { action: { label: 'Undo', run: () => { undone++ } }, ms: 8000 }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undone).toBe(1)
    expect(screen.queryByText('Declined Farhan')).toBeNull()
  })

  it('doesNothingWithoutAHost', () => {
    expect(() => toast('nobody listens')).not.toThrow()
  })
})
