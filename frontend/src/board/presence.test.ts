import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { userColor } from '../editor/userColor'
import { createRateLimiter, createSender, toCollaborators, type BoardAwareness } from './presence'

const state = (id: string, extra: Partial<BoardAwareness> = {}): BoardAwareness => ({ user: { id, name: id, color: 'red' }, ...extra })
const at = (tool: 'pointer' | 'laser') => ({ x: 1, y: 2, tool })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('collaboratorsExcludeSelf', () => {
  const map = toCollaborators(new Map([[1, state('me')], [2, state('ann')], [3, {} as BoardAwareness]]), 1, new Set())
  expect([...map.keys()]).toEqual(['2'])
})

it('viewerShowsLaserOnly', () => {
  const shown = (tool: 'pointer' | 'laser') =>
    toCollaborators(new Map([[2, state('v', { pointer: at(tool), selectedElementIds: { a: true } })]]), 1, new Set([2])).values().next().value!
  expect(shown('pointer').pointer!.renderCursor).toBe(false)
  expect(shown('laser').pointer!.renderCursor).toBe(true)
  expect(shown('laser').selectedElementIds).toEqual({})
})

it('badPointerIsDropped', () => {
  const bad = state('x', { pointer: { x: 'a' as unknown as number, y: 0, tool: 'laser' } })
  expect(toCollaborators(new Map([[2, bad]]), 1, new Set()).values().next().value!.pointer).toBeUndefined()
})

it('colourFromUserColor', () => {
  const c = toCollaborators(new Map([[2, state('u42', { pointer: at('laser') })]]), 1, new Set()).values().next().value!
  expect(c.color!.background).toBe(userColor('u42'))
  expect(c.pointer!.laserColor).toBe(userColor('u42'))
})

/** A sender on a real Awareness, counting what actually goes out. */
function sender() {
  const awareness = new Awareness(new Y.Doc())
  const sent = vi.fn()
  awareness.on('update', sent)
  return { awareness, sent, send: createSender(awareness) }
}

it('pointerAtMostTenPerSecond', () => {
  const run = vi.fn()
  const limit = createRateLimiter(10)
  for (let i = 0; i < 50; i++, vi.advanceTimersByTime(20)) limit(run)
  expect(run.mock.calls.length).toBeLessThanOrEqual(11)

  const { awareness, sent, send } = sender()
  for (let i = 0; i < 50; i++, vi.advanceTimersByTime(20)) {
    send.pointer({ x: i, y: 0, tool: 'pointer' }, 'up')
    send.selection({ a: true })
  }
  vi.advanceTimersByTime(200)
  expect(sent.mock.calls.length).toBeLessThanOrEqual(11)
  expect(awareness.getLocalState()).toMatchObject({ pointer: { x: 49 }, selectedElementIds: { a: true } })
  awareness.destroy()
})

it('viewportOnlyWhenChangedAtMostFour', () => {
  const { awareness, sent, send } = sender()
  const view = (x: number) => ({ x, y: 0, width: 800, height: 600, zoom: 1 })
  for (let i = 0; i < 50; i++, vi.advanceTimersByTime(20)) send.viewport(view(i))
  vi.advanceTimersByTime(500)
  expect(sent.mock.calls.length).toBeLessThanOrEqual(5)
  expect(awareness.getLocalState()!.viewport).toEqual(view(49))

  sent.mockClear()
  for (let i = 0; i < 10; i++, vi.advanceTimersByTime(300)) send.viewport(view(49))
  expect(sent).not.toHaveBeenCalled()
  awareness.destroy()
})
