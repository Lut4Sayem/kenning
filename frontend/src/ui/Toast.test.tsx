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

  it('doesNothingWithoutAHost', () => {
    expect(() => toast('nobody listens')).not.toThrow()
  })
})
