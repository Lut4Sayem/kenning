import { describe, expect, it } from 'vitest'
import { timeCompact, timeShort } from '../ui/timeAgo'
import { greetingFor, groupByDay, locationOf, longDate } from './home'

describe('home helpers', () => {
  it('greetingSwitchesAtNoonAndFivePm', () => {
    expect([0, 11, 12, 16, 17, 23].map(greetingFor)).toEqual([
      'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening',
    ])
  })

  it('longDateHasWeekdayCommaDayMonth', () => {
    expect(longDate(new Date(2026, 10, 15))).toBe('Sunday, 15 November')
    expect(longDate(new Date(2026, 0, 3))).toBe('Saturday, 3 January')
  })

  it('groupsByLocalCalendarDayNotBy24Hours', () => {
    const now = new Date(2026, 10, 15, 0, 30) // 00:30
    const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString()
    const items = [{ w: at(15, 0, 10) }, { w: at(14, 23, 50) }, { w: at(14, 0, 5) }, { w: at(13, 23, 59) }]
    const g = groupByDay(items, (i) => i.w, now)
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['Today', 1], ['Yesterday', 2], ['Earlier', 1]])
  })

  it('leavesEmptyGroupsOut', () => {
    expect(groupByDay([{ w: new Date(2020, 0, 1).toISOString() }], (i) => i.w, new Date(2026, 10, 15)).map((x) => x.label)).toEqual(['Earlier'])
  })

  it('locationIsPrivateOrTeamAndSpace', () => {
    expect(locationOf(null, 'Private')).toBe('Private')
    expect(locationOf('CSE391', 'Requirements')).toBe('CSE391 · Requirements')
  })

  it('shortTimes', () => {
    const now = Date.parse('2026-11-15T12:00:00Z')
    const ago = (min: number) => new Date(now - min * 60_000).toISOString()
    expect([0, 5, 120, 24 * 60, 3 * 24 * 60].map((m) => timeShort(ago(m), now))).toEqual(['just now', '5m ago', '2h ago', 'yesterday', '3d ago'])
    expect([0, 5, 120, 24 * 60, 3 * 24 * 60].map((m) => timeCompact(ago(m), now))).toEqual(['now', '5m', '2h', '1d', '3d'])
  })
})
