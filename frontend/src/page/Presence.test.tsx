import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Presence from './Presence'

function fakeAwareness(states: Record<string, unknown>[]) {
  const map = new Map(states.map((st, i) => [i + 1, st]))
  const subs = new Set<() => void>()
  return {
    getStates: () => map,
    on: (_: 'change', cb: () => void) => void subs.add(cb),
    off: (_: 'change', cb: () => void) => void subs.delete(cb),
    set(id: number, st: Record<string, unknown>) {
      map.set(id, st)
      subs.forEach((cb) => cb())
    },
  }
}
afterEach(cleanup)
const person = (userId: string, name: string, viewer = false) => ({ kf: { userId, viewer }, user: { name, color: '#1d65a0' } })

describe('Presence', () => {
  it('showsFourPlusN', () => {
    const a = fakeAwareness(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => person(id, `Person ${id.toUpperCase()}`)))
    const { container } = render(<Presence awareness={a} selfId="me" />)
    expect(container.querySelectorAll('[data-person]').length).toBe(4)
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('leavesOutMyself', () => {
    const a = fakeAwareness([person('me', 'Me Myself')])
    const { container } = render(<Presence awareness={a} selfId="me" />)
    expect(container.textContent).toBe('')
  })

  it('viewerHasEyeBadge', () => {
    const a = fakeAwareness([person('a', 'Ann Lee', true), person('b', 'Bo Kim')])
    const { container } = render(<Presence awareness={a} selfId="me" />)
    expect(container.querySelectorAll('[data-viewer]').length).toBe(1)
    expect(screen.getByLabelText(/^Also on this page/).getAttribute('aria-label')).toBe('Also on this page: Ann Lee (viewing), Bo Kim')
  })

  it('sameUserTwoTabsShownOnce', () => {
    const a = fakeAwareness([person('a', 'Ann Lee', true), person('a', 'Ann Lee', false)])
    const { container } = render(<Presence awareness={a} selfId="me" />)
    expect(screen.getByLabelText(/^Also on this page/).getAttribute('aria-label')).toBe('Also on this page: Ann Lee') // editing in one tab
    expect(container.querySelectorAll('[data-viewer]').length).toBe(0)
  })

  it('updatesWhenSomeoneJoins', () => {
    const a = fakeAwareness([])
    render(<Presence awareness={a} selfId="me" />)
    act(() => a.set(7, person('z', 'Zed Ray')))
    expect(screen.getByLabelText(/^Also on this page/).getAttribute('aria-label')).toBe('Also on this page: Zed Ray')
  })
})
