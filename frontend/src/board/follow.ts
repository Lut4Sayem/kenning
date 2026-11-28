// Follow someone's view, and "bring everyone to me" (WB 7.6). Excalidraw leaves sending and applying viewports to
// the host app: each tab puts its viewport in awareness (presence.ts) and a follower copies it here.
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useState } from 'react'
import type { BoardAwareness } from './presence'

type Viewport = NonNullable<BoardAwareness['viewport']>
export type View = { scrollX: number; scrollY: number; zoom: number }
export type FollowApi = Pick<ExcalidrawImperativeAPI, 'getAppState' | 'updateScene' | 'onScrollChange' | 'onPointerDown'>

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>
  on(event: 'change', cb: () => void): void
  off(event: 'change', cb: () => void): void
}

/** My view showing all of their visible area, centred, in my own aspect ratio. */
export function fitViewport(their: Viewport, mine: { width: number; height: number }): View {
  const zoom = Math.min(30, Math.max(0.1, Math.min(mine.width / their.width, mine.height / their.height)))
  return {
    scrollX: mine.width / zoom / 2 - (their.x + their.width / 2),
    scrollY: mine.height / zoom / 2 - (their.y + their.height / 2),
    zoom,
  }
}

const finite = (...n: unknown[]) => n.every((v) => typeof v === 'number' && Number.isFinite(v))

/** Someone's name and viewport (any client can put anything in its awareness, so checked). */
function find(states: Map<number, Record<string, unknown>>, userId: string) {
  let found: { name: string; viewport?: Viewport } | null = null
  // shortcut: with several tabs open, the first one that has a viewport is followed; track the client id if that matters
  for (const st of states.values()) {
    const { user, viewport: v } = st as Partial<BoardAwareness>
    if (user?.id !== userId || typeof user.name !== 'string') continue
    const ok = v && finite(v.x, v.y, v.width, v.height) && v.width > 0 && v.height > 0
    if (ok) return { name: user.name, viewport: v }
    found ??= { name: user.name }
  }
  return found
}

/** Following one person: my view copies theirs until I pan, zoom or press on the canvas, or they leave. */
export function useFollow(api: FollowApi | null, awareness: AwarenessLike | null | undefined) {
  const [following, setFollowing] = useState<{ userId: string; name: string } | null>(null)
  const userId = following?.userId

  useEffect(() => {
    if (!api || !awareness || !userId) return
    let applied: View | null = null
    const stop = () => setFollowing(null)
    const apply = () => {
      const them = find(awareness.getStates(), userId)
      if (!them) return stop() // they left
      if (!them.viewport) return
      const { width, height } = api.getAppState()
      const next = fitViewport(them.viewport, { width, height })
      if (applied && same(applied, next)) return
      applied = next
      // zoom is a branded number in Excalidraw's types
      api.updateScene({ appState: { scrollX: next.scrollX, scrollY: next.scrollY, zoom: { value: next.zoom as never } } })
    }
    // a view change that is not the one applied here is this user's own pan or zoom
    const onScroll = (scrollX: number, scrollY: number, zoom: { value: number }) => {
      if (!applied || !same(applied, { scrollX, scrollY, zoom: zoom.value })) stop()
    }
    apply()
    awareness.on('change', apply)
    const offScroll = api.onScrollChange(onScroll)
    const offDown = api.onPointerDown(stop)
    return () => {
      awareness.off('change', apply)
      offScroll()
      offDown()
    }
  }, [api, awareness, userId])

  const follow = useCallback((id: string) => {
    const them = awareness && find(awareness.getStates(), id)
    if (them) setFollowing({ userId: id, name: them.name })
  }, [awareness])
  const stop = useCallback(() => setFollowing(null), [])
  return { following, follow, stop }
}

const same = (a: View, b: View) =>
  Math.abs(a.scrollX - b.scrollX) < 0.5 && Math.abs(a.scrollY - b.scrollY) < 0.5 && Math.abs(a.zoom - b.zoom) < 1e-3
