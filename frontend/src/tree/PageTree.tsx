import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useDndContext, useDraggable, useDroppable, useSensor,
  useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTree, moveNode, type MoveBody, type NodeSummary } from '../api/nodes'
import Icon from '../ui/Icon'
import { buildTree, type TreeNode } from './buildTree'
import s from './PageTree.module.css'
import { useCreatePage } from './useCreatePage'

const cx = (...c: (string | false)[]) => c.filter(Boolean).join(' ')
const storageKey = (spaceId: string) => `kf.expanded.${spaceId}`

function loadExpanded(spaceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(spaceId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveExpanded(spaceId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(spaceId), JSON.stringify([...ids]))
  } catch {
    // private mode or blocked storage: the tree just starts collapsed next time
  }
}

interface Props {
  spaceId: string
  activeId?: string
}

export default function PageTree({ spaceId, activeId }: Props) {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['tree', spaceId], queryFn: () => getTree(spaceId) })
  const nodes = useMemo<NodeSummary[]>(() => data ?? [], [data])
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const [expanded, setExpanded] = useState(() => loadExpanded(spaceId))
  const { create, message, setMessage } = useCreatePage(spaceId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const expand = (ids: string[]) =>
    setExpanded((prev) => {
      if (ids.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      saveExpanded(spaceId, next)
      return next
    })

  // Open the branch that holds the current page.
  useEffect(() => {
    if (!activeId) return
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const chain: string[] = []
    for (let p = byId.get(activeId)?.parentId; p && byId.has(p) && !chain.includes(p); p = byId.get(p)?.parentId) chain.push(p)
    if (chain.length) expand(chain)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, nodes])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      saveExpanded(spaceId, next)
      return next
    })

  const newPage = (parentId: string) => create(parentId, () => expand([parentId])) // top-level pages come from the space row's +

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const id = String(active.id)
    const [kind, targetId] = String(over.id).split(':')
    if (targetId === id) return
    let body: MoveBody
    if (kind === 'in') {
      body = { parentId: targetId }
    } else if (kind === 'after') {
      body = { parentId: nodes.find((n) => n.id === targetId)?.parentId ?? null, afterId: targetId }
    } else {
      body = { parentId: null }
    }
    setMessage('')
    try {
      await moveNode(id, body)
      if (kind === 'in') expand([targetId])
      await qc.invalidateQueries({ queryKey: ['tree', spaceId] })
      await qc.invalidateQueries({ queryKey: ['node', id] })
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not move the page')
    }
  }

  if (isLoading) return <div className={s.skelList} aria-busy="true" aria-label="Loading pages">{[70, 55, 62].map((w) => <span key={w} className={s.skel} style={{ width: `${w}%` }} />)}</div>
  if (error) return <p className={s.note} role="alert">Could not load the pages. <button type="button" className={s.retry} onClick={() => void refetch()}>Try again</button></p>

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {message && <p className={s.note} role="alert">{message}</p>}
      <ul className={s.tree}>
        {tree.map((node) => (
          <Row key={node.id} node={node} depth={0} activeId={activeId} expanded={expanded} onToggle={toggle} onNew={newPage} />
        ))}
      </ul>
      <TopLevelDrop spaceId={spaceId} />
    </DndContext>
  )
}

interface RowProps {
  node: TreeNode
  depth: number
  activeId?: string
  expanded: Set<string>
  onToggle: (id: string) => void
  onNew: (parentId: string) => void
}

function Row({ node, depth, activeId, expanded, onToggle, onNew }: RowProps) {
  const drag = useDraggable({ id: node.id })
  const into = useDroppable({ id: `in:${node.id}` })
  const after = useDroppable({ id: `after:${node.id}` })
  const open = expanded.has(node.id)
  const title = node.title || 'Untitled'
  return (
    <li className={cx(s.item, drag.isDragging && s.dragging)}>
      <div
        ref={(el) => { drag.setNodeRef(el); into.setNodeRef(el) }}
        className={cx(s.row, into.isOver && s.over, node.id === activeId && s.active)}
        style={{ paddingLeft: depth * 12 }}
      >
        <button type="button" className={s.toggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          onClick={() => onToggle(node.id)} disabled={node.children.length === 0}>
          <Icon name="chevron-right" className={cx(s.chev, open && s.open)} />
        </button>
        {/* shortcut: page colour field comes later, every page shows the gray dot */}
        <span className={s.dot} aria-hidden="true" />
        <Link to={`/p/${node.id}`} className={s.link} aria-current={node.id === activeId ? 'page' : undefined}>
          {title}
        </Link>
        <button type="button" className={s.btn} aria-label={`New sub-page under ${title}`} onClick={() => onNew(node.id)}><Icon name="plus" /></button>
        <button type="button" className={cx(s.btn, s.grip)} aria-label={`Move ${title}`}
          {...drag.listeners} {...drag.attributes}><Icon name="grip" /></button>
      </div>
      {open && node.children.length > 0 && (
        <ul className={s.tree}>
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} activeId={activeId} expanded={expanded} onToggle={onToggle} onNew={onNew} />
          ))}
        </ul>
      )}
      <div ref={after.setNodeRef} className={cx(s.gap, after.isOver && s.over)} style={{ marginLeft: depth * 12 }} />
    </li>
  )
}

/** Only visible while dragging: drop here to make a page top-level (at the end). */
function TopLevelDrop({ spaceId }: { spaceId: string }) {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: `top:${spaceId}` })
  if (!active) return null
  return <div ref={setNodeRef} className={cx(s.topDrop, isOver && s.over)} data-testid="top-drop" data-over={isOver}>Move to top level</div>
}
