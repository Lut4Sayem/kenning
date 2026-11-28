// Who else is on a board and where (WB 7.6): the awareness state this tab sends, and others' states as Excalidraw
// collaborators.
import type { Collaborator, SocketId } from '@excalidraw/excalidraw/types'
import type { Awareness } from 'y-protocols/awareness'
import { userColor } from '../editor/userColor'
import { createThrottle } from './binding/sync'

export type BoardAwareness = {
  user: { id: string; name: string; color: string }
  pointer?: { x: number; y: number; tool: 'pointer' | 'laser' }
  button?: 'up' | 'down'
  selectedElementIds?: Record<string, true>
  /** What this person sees, in scene coordinates: top-left corner and size. */
  viewport?: { x: number; y: number; width: number; height: number; zoom: number }
}

export const createRateLimiter = (perSecond: number) => createThrottle(1000 / perSecond)

/** Others' awareness states, checked before use: any client can put anything in its own. */
export function toCollaborators(states: Map<number, BoardAwareness>, selfClientId: number, viewers: Set<number>): Map<SocketId, Collaborator> {
  const out = new Map<SocketId, Collaborator>()
  for (const [clientId, state] of states) {
    const { user, pointer, button, selectedElementIds } = state
    if (clientId === selfClientId || typeof user?.id !== 'string' || typeof user.name !== 'string') continue
    const color = userColor(user.id) // as on pages; never the colour the other client claims
    const socketId = String(clientId) as SocketId
    const viewer = viewers.has(clientId)
    const placed = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)
    const laser = placed && pointer.tool === 'laser'
    out.set(socketId, {
      id: user.id,
      socketId,
      username: user.name,
      // shortcut: Excalidraw 0.18.1 draws cursors and selection outlines in its own per-id pastel and reads only
      // laserColor; `color` takes effect if a later version honours it.
      color: { background: color, stroke: color },
      button: button === 'down' ? 'down' : 'up',
      selectedElementIds: !viewer && typeof selectedElementIds === 'object' && selectedElementIds ? selectedElementIds : {},
      pointer: placed
        ? { x: pointer.x, y: pointer.y, tool: laser ? 'laser' : 'pointer', laserColor: color, renderCursor: !viewer || !!laser }
        : undefined,
    })
  }
  return out
}

type Patch = Partial<BoardAwareness>

/** Sends fields of the local state at most `perSecond` times a second, the latest values, and only when they changed. */
function channel(awareness: Awareness, perSecond: number) {
  const limit = createRateLimiter(perSecond)
  let want: Patch = {}
  const same = (a: object, patch: Patch) =>
    Object.entries(patch).every(([k, v]) => JSON.stringify((a as Record<string, unknown>)[k]) === JSON.stringify(v))
  const flush = () => {
    const state = awareness.getLocalState() // null once the provider is gone
    if (state && !same(state, want)) awareness.setLocalState({ ...state, ...want }) // one message for all fields
  }
  return (patch: Patch) => {
    if (same(want, patch) && Object.keys(patch).every((k) => k in want)) return
    want = { ...want, ...patch }
    limit(flush)
  }
}

export function createSender(awareness: Awareness) {
  const fast = channel(awareness, 10) // pointer and selection
  const slow = channel(awareness, 4) // viewport
  return {
    pointer: (pointer: BoardAwareness['pointer'], button: 'up' | 'down') => fast({ pointer, button }),
    selection: (selectedElementIds: Record<string, true>) => fast({ selectedElementIds }),
    viewport: (viewport: NonNullable<BoardAwareness['viewport']>) => slow({ viewport }),
  }
}
