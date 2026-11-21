import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardCursor } from './collab'

describe('guardCursor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const fake = () => {
    const sent: [string, unknown][] = []
    return { sent, setLocalStateField: (f: string, v: unknown) => void sent.push([f, v]) }
  }

  it('cursorThrottledTo10PerSecond', () => {
    const a = fake()
    guardCursor(a, () => false)
    for (let i = 0; i < 50; i++) {
      a.setLocalStateField('cursor', i)
      vi.advanceTimersByTime(20) // 50 moves per second
    }
    vi.advanceTimersByTime(200)
    const cursors = a.sent.filter(([f]) => f === 'cursor')
    expect(cursors.length).toBeLessThanOrEqual(11)
    expect(cursors.at(-1)![1]).toBe(49) // the last position always arrives
  })

  it('viewerSendsNoCursor', () => {
    const a = fake()
    guardCursor(a, () => true)
    a.setLocalStateField('cursor', { anchor: 1 })
    a.setLocalStateField('user', { name: 'V' })
    expect(a.sent).toEqual([['cursor', null], ['user', { name: 'V' }]])
  })
})
