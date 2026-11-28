import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fitViewport, useFollow, type FollowApi } from './follow'

describe('fitViewport', () => {
  it('fitViewportKeepsAspect', () => {
    // their wide view into my square window: all of it fits, so the zoom follows the wider side
    const v = fitViewport({ x: 0, y: 0, width: 1000, height: 500, zoom: 1 }, { width: 500, height: 500 })
    expect(v.zoom).toBe(0.5)
    expect(fitViewport({ x: 0, y: 0, width: 1, height: 1, zoom: 1 }, { width: 1000, height: 1000 }).zoom).toBe(30)
    expect(fitViewport({ x: 0, y: 0, width: 1e6, height: 1e6, zoom: 1 }, { width: 100, height: 100 }).zoom).toBe(0.1)
  })

  it('fitViewportCentresTheirArea', () => {
    const their = { x: 200, y: -100, width: 400, height: 300, zoom: 2 }
    const mine = { width: 800, height: 400 }
    const v = fitViewport(their, mine)
    // the scene point at the centre of my window is the centre of theirs
    expect(-v.scrollX + mine.width / v.zoom / 2).toBeCloseTo(400)
    expect(-v.scrollY + mine.height / v.zoom / 2).toBeCloseTo(50)
  })
})

function fakes() {
  const states = new Map<number, Record<string, unknown>>([
    [2, { user: { id: 'u2', name: 'Bo Kim' }, viewport: { x: 0, y: 0, width: 1000, height: 500, zoom: 1 } }],
  ])
  const subs = new Set<() => void>()
  const awareness = { getStates: () => states, on: (_: 'change', cb: () => void) => void subs.add(cb), off: (_: 'change', cb: () => void) => void subs.delete(cb) }
  let onScroll: (x: number, y: number, z: { value: number }) => void = () => {}
  let onDown: () => void = () => {}
  const api = {
    getAppState: () => ({ width: 500, height: 500 }),
    updateScene: vi.fn(),
    onScrollChange: (cb: typeof onScroll) => ((onScroll = cb), () => {}),
    onPointerDown: (cb: () => void) => ((onDown = cb), () => {}),
  } as unknown as FollowApi
  return { awareness, api, scroll: (x: number, y: number, z: number) => onScroll(x, y, { value: z }), down: () => onDown(), states, subs }
}

describe('useFollow', () => {
  it('followStopsOnPan', () => {
    const f = fakes()
    const { result } = renderHook(() => useFollow(f.api, f.awareness))
    act(() => result.current.follow('u2'))
    expect(result.current.following).toEqual({ userId: 'u2', name: 'Bo Kim' })
    expect(f.api.updateScene).toHaveBeenCalledWith({ appState: { scrollX: 0, scrollY: 250, zoom: { value: 0.5 } } })
    act(() => f.scroll(0, 250, 0.5)) // the view applied for them: still following
    expect(result.current.following).not.toBeNull()
    act(() => f.scroll(40, 250, 0.5)) // my own pan
    expect(result.current.following).toBeNull()
  })

  it('followStopsOnPointerDownOrWhenTheyLeave', () => {
    const f = fakes()
    const { result } = renderHook(() => useFollow(f.api, f.awareness))
    act(() => result.current.follow('u2'))
    act(() => f.down())
    expect(result.current.following).toBeNull()
    act(() => result.current.follow('u2'))
    act(() => {
      f.states.clear()
      f.subs.forEach((cb) => cb())
    })
    expect(result.current.following).toBeNull()
  })
})
