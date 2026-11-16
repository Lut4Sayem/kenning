import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Time, { fullDate, timeAgo } from './timeAgo'

afterEach(cleanup)

// One time format everywhere: relative for the last day, then the date; the full date in a tooltip.
describe('timeAgo', () => {
  const now = Date.parse('2026-11-15T12:00:00Z')
  const ago = (min: number) => new Date(now - min * 60_000).toISOString()

  it('saysJustNowMinutesHoursYesterdayThenTheDate', () => {
    expect([0, 0.5, 5, 59, 120, 23 * 60 + 59, 24 * 60, 47 * 60].map((m) => timeAgo(ago(m), now)))
      .toEqual(['just now', 'just now', '5 min ago', '59 min ago', '2 h ago', '23 h ago', 'yesterday', 'yesterday'])
    expect(timeAgo('2026-11-12T08:00:00Z', now)).toBe('12 Nov')
    expect(timeAgo('2025-12-30T08:00:00Z', now)).toBe('30 Dec 2025')
    expect(timeAgo(null, now)).toBe('')
  })

  it('timeElementCarriesTheFullDateAsATooltip', () => {
    const iso = '2026-11-12T08:05:00Z'
    const { container } = render(<Time iso={iso} />)
    const t = container.querySelector('time')!
    expect(t.getAttribute('dateTime')).toBe(iso)
    expect(t.getAttribute('title')).toBe(fullDate(iso))
    expect(fullDate(iso)).toMatch(/^12 Nov 2026, \d\d:05$/)
  })
})
