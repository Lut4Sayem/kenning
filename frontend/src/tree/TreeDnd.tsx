import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { moveNode, type MoveBody, type NodeSummary } from '../api/nodes'
import type { MySpace } from '../api/spaces'
import s from './PageTree.module.css'

/**
 * One drag-and-drop area for the page trees of a team, so a page can be dragged into another space of the same team
 * (QA-12). Drop targets: `in:<page>`, `after:<page>`, `top:<space>` (the strip under a tree) and `space:<space>` (the
 * space row). Pages are found in the cached `['tree', spaceId]` lists.
 */
interface Scope {
  /** A tree registers how to open a page's row (after something was dropped into it). */
  onExpand: Map<string, (ids: string[]) => void>
}
const ScopeContext = createContext<Scope | null>(null)
export const useTreeDnd = () => useContext(ScopeContext)

export default function TreeDnd({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const scope = useRef<Scope>({ onExpand: new Map() }).current
  const [message, setMessage] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const find = (id: string) => {
    for (const [key, list] of qc.getQueriesData<NodeSummary[]>({ queryKey: ['tree'] })) {
      const node = list?.find((n) => n.id === id)
      if (node) return { node, spaceId: String(key[1]) }
    }
    return undefined
  }
  const spaceName = (id: string) => qc.getQueryData<MySpace[]>(['spaces'])?.find((x) => x.id === id)?.name ?? 'that space'
  /** Where a drop target puts the page: its space, and the body for POST /move (without spaceId). */
  const target = (overId: string | number): { spaceId?: string; body: MoveBody } => {
    const [kind, id] = String(overId).split(':')
    if (kind === 'in') return { spaceId: find(id)?.spaceId, body: { parentId: id } }
    if (kind === 'after') {
      const t = find(id)
      return { spaceId: t?.spaceId, body: { parentId: t?.node.parentId ?? null, afterId: id } }
    }
    return { spaceId: id, body: { parentId: null } }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const id = String(active.id)
    const [kind, targetId] = String(over.id).split(':')
    if (targetId === id) return
    const from = find(id)?.spaceId
    const { spaceId, body } = target(over.id)
    if (!from || !spaceId) return
    setMessage('')
    try {
      await moveNode(id, spaceId === from ? body : { ...body, spaceId })
      if (kind === 'in') scope.onExpand.get(spaceId)?.([targetId])
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tree', from] }),
        qc.invalidateQueries({ queryKey: ['tree', spaceId] }),
        qc.invalidateQueries({ queryKey: ['node', id] }),
      ])
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not move the page')
    }
  }

  // QA-14: dnd-kit's default announcements read database ids; these use the page titles.
  const titleOf = (id: string | number) => find(String(id))?.node.title || 'Untitled'
  const whereTo = (activeId: string | number, overId: string | number) => {
    const [kind, id] = String(overId).split(':')
    if (kind === 'in') return `inside ${titleOf(id)}`
    if (kind === 'after') return `below ${titleOf(id)}`
    return find(String(activeId))?.spaceId === id ? 'to the top level' : `to the top of ${spaceName(id)}`
  }
  // dnd-kit announces the first "over" right after the pick-up (the page's own row, whose drop zones only switch off a
  // moment later), which would replace "Picked up", so that one keeps saying it.
  const pickedUp = useRef('')
  const announcements: Announcements = {
    onDragStart: ({ active }) => (pickedUp.current = `Picked up ${titleOf(active.id)}.`),
    onDragOver: ({ active, over }) => {
      if (over && String(over.id).endsWith(`:${active.id}`)) return pickedUp.current
      const first = pickedUp.current
      pickedUp.current = ''
      return `${first ? first + ' ' : ''}${over ? `Move ${titleOf(active.id)} ${whereTo(active.id, over.id)}.` : `${titleOf(active.id)} is not over a place to drop.`}`
    },
    onDragEnd: ({ active, over }) => over ? `Moved ${titleOf(active.id)} ${whereTo(active.id, over.id)}.` : `${titleOf(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `${titleOf(active.id)} was not moved.`,
  }
  const screenReaderInstructions = { draggable: 'Press Space to pick up the page, the arrow keys to move it, Space to drop it, Escape to cancel.' }

  return (
    <ScopeContext.Provider value={scope}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions }}>
        {message && <p className={s.note} role="alert">{message}</p>}
        {children}
      </DndContext>
    </ScopeContext.Provider>
  )
}

/** The space row as a drop target: dropping a page on it moves the page to the end of that space's top level. */
export function useSpaceDrop(spaceId: string) {
  return useDroppable({ id: `space:${spaceId}` })
}
