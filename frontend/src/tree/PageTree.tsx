import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getNode, getTree, type NodeSummary } from '../api/nodes'
import PageMenu from '../page/PageMenu'
import Icon from '../ui/Icon'
import { dotColour } from '../ui/pageColour'
import { buildTree, type TreeNode } from './buildTree'
import TreeDnd, { useTreeDnd } from './TreeDnd'
import s from './PageTree.module.css'
import { useCreatePage } from './useCreatePage'
import { inDialog, openRowMenu } from './useRowTouch'

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
  /** false for viewers: no New sub-page and no drag grip (QA-37) */
  canEdit?: boolean
  /** Name of the tree for screen readers, e.g. "Pages in Literature Review" */
  label?: string
  /** The private space: the row menu offers Move to team */
  personal?: boolean
}

/** The pages a reader can reach with the arrow keys: every top-level page and the children of open ones, top to bottom. */
function visibleIds(list: TreeNode[], expanded: Set<string>, out: string[] = []): string[] {
  for (const n of list) {
    out.push(n.id)
    if (expanded.has(n.id)) visibleIds(n.children, expanded, out)
  }
  return out
}

/** A tree on its own (the private space, tests) gets its own drag area; the trees of one team share one (QA-12). */
export default function PageTree(props: Props) {
  return useTreeDnd() ? <Tree {...props} /> : <TreeDnd><Tree {...props} /></TreeDnd>
}

function Tree({ spaceId, activeId, canEdit = true, label = 'Pages', personal }: Props) {
  const dnd = useTreeDnd()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['tree', spaceId], queryFn: () => getTree(spaceId) })
  const nodes = useMemo<NodeSummary[]>(() => data ?? [], [data])
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const [expanded, setExpanded] = useState(() => loadExpanded(spaceId))
  const { create, message } = useCreatePage(spaceId)

  const expand = (ids: string[]) =>
    setExpanded((prev) => {
      if (ids.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      saveExpanded(spaceId, next)
      return next
    })

  // A page dropped into a row of this tree opens that row.
  useEffect(() => {
    dnd?.onExpand.set(spaceId, expand)
    return () => { dnd?.onExpand.delete(spaceId) }
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

  // QA-45: the tree is one Tab stop (roving tabindex, WAI-ARIA tree): the focused row, else the open page, else the first.
  const [focusId, setFocusId] = useState<string | null>(null)
  const visible = visibleIds(tree, expanded)
  const tabStop = [focusId, activeId].find((id) => id && visible.includes(id)) ?? visible[0]
  const byId = useMemo(() => {
    const m = new Map<string, TreeNode>()
    const walk = (list: TreeNode[]) => list.forEach((n) => { m.set(n.id, n); walk(n.children) })
    walk(tree)
    return m
  }, [tree])

  function onTreeKey(e: React.KeyboardEvent<HTMLUListElement>) {
    const id = (e.target as HTMLElement).getAttribute('data-id')
    const node = id ? byId.get(id) : undefined
    if (!node) return // a row's buttons keep their own keys (Space on the grip starts a keyboard drag)
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const at = items.indexOf(e.target as HTMLElement)
    const open = expanded.has(node.id) && node.children.length > 0
    let next: HTMLElement | undefined
    switch (e.key) {
      case 'ArrowDown': next = items[at + 1]; break
      case 'ArrowUp': next = items[at - 1]; break
      case 'Home': next = items[0]; break
      case 'End': next = items[items.length - 1]; break
      case 'ArrowRight':
        if (node.children.length && !open) toggle(node.id)
        else if (open) next = items[at + 1]
        break
      case 'ArrowLeft':
        if (open) toggle(node.id)
        else next = items.find((el) => el.getAttribute('data-id') === node.parentId)
        break
      default: return
    }
    e.preventDefault()
    next?.focus()
  }

  const newPage = (parentId: string) => create(parentId, () => expand([parentId])) // top-level pages come from the space row's +

  if (isLoading) return <div className={s.skelList} aria-busy="true" aria-label="Loading pages">{[70, 55, 62].map((w) => <span key={w} className={s.skel} style={{ width: `${w}%` }} />)}</div>
  if (error) return <p className={s.note} role="alert">Could not load the pages. <button type="button" className={s.retry} onClick={() => void refetch()}>Try again</button></p>

  return (
    <>
      {message && <p className={s.note} role="alert">{message}</p>}
      <ul className={s.tree} role="tree" aria-label={label} onKeyDown={onTreeKey}>
        {tree.map((node) => (
          <Row key={node.id} node={node} depth={0} activeId={activeId} expanded={expanded} onToggle={toggle} onNew={newPage} canEdit={canEdit}
            personal={personal} tabStop={tabStop} onFocusRow={setFocusId} />
        ))}
      </ul>
      <TopLevelDrop spaceId={spaceId} />
    </>
  )
}

interface RowProps {
  node: TreeNode
  depth: number
  activeId?: string
  expanded: Set<string>
  onToggle: (id: string) => void
  onNew: (parentId: string) => void
  canEdit: boolean
  personal?: boolean
  /** The one row in Tab order; its New sub-page and grip buttons follow it */
  tabStop?: string
  onFocusRow: (id: string) => void
}

function Row({ node, depth, activeId, expanded, onToggle, onNew, canEdit, personal, tabStop, onFocusRow }: RowProps) {
  const drag = useDraggable({ id: node.id })
  // A page can't be dropped on its own row: those drops were no-ops announced as "inside itself"
  const into = useDroppable({ id: `in:${node.id}`, disabled: drag.isDragging })
  const after = useDroppable({ id: `after:${node.id}`, disabled: drag.isDragging })
  const open = expanded.has(node.id)
  const title = node.title || 'Untitled'
  const tab = node.id === tabStop ? 0 : -1
  const { onTouchStart, ...gripListeners } = drag.listeners ?? {} // a finger drags the whole row (long press), the mouse the grip
  return (
    <li role="none" className={cx(s.item, drag.isDragging && s.dragging)}>
      <div
        ref={(el) => { drag.setNodeRef(el); into.setNodeRef(el) }}
        className={cx(s.row, into.isOver && s.over, node.id === activeId && s.active)}
        style={{ paddingLeft: depth * 12 }} data-row
        onTouchStart={canEdit ? (e) => { if (!inDialog(e)) (onTouchStart as React.TouchEventHandler)(e) } : undefined} onContextMenu={openRowMenu}
      >
        <button type="button" tabIndex={-1} className={s.toggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          onClick={() => onToggle(node.id)} disabled={node.children.length === 0}>
          <Icon name="chevron-right" className={cx(s.chev, open && s.open)} />
        </button>
        <span className={s.dot} style={{ background: dotColour(node.color) }} aria-hidden="true" />
        <Link to={`/p/${node.id}`} className={s.link} title={title} aria-current={node.id === activeId ? 'page' : undefined}
          role="treeitem" data-id={node.id} tabIndex={tab} aria-level={depth + 1} aria-expanded={node.children.length ? open : undefined}
          onFocus={() => onFocusRow(node.id)}>
          {title}
        </Link>
        {canEdit && (
          <>
            <button type="button" tabIndex={tab} className={s.btn} aria-label={`New sub-page under ${title}`} onClick={() => onNew(node.id)}><Icon name="plus" /></button>
            <RowMenu id={node.id} title={title} personal={personal} tabIndex={tab} />
            <button type="button" className={cx(s.btn, s.grip)} aria-label={`Drag to move ${title}`} title="Drag to move"
              {...gripListeners} {...drag.attributes} tabIndex={tab}><Icon name="grip" /></button>
          </>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ul className={s.tree} role="group">
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} activeId={activeId} expanded={expanded} onToggle={onToggle} onNew={onNew} canEdit={canEdit}
              personal={personal} tabStop={tabStop} onFocusRow={onFocusRow} />
          ))}
        </ul>
      )}
      <div ref={after.setNodeRef} className={cx(s.gap, after.isOver && s.over)} style={{ marginLeft: depth * 12 }} />
    </li>
  )
}

/** QA-18: the page's own "…" menu on its row. The tree only has summaries, so the page loads when the menu is first asked for. */
function RowMenu({ id, title, personal, tabIndex }: { id: string; title: string; personal?: boolean; tabIndex: number }) {
  const [wanted, setWanted] = useState(false)
  const { data } = useQuery({ queryKey: ['node', id], queryFn: () => getNode(id), enabled: wanted })
  const label = `More actions for ${title}`
  if (data) return <PageMenu node={data} unsaved={false} personal={personal} label={label} buttonClass={s.btn} tabIndex={tabIndex} defaultOpen={wanted} />
  return (
    <button type="button" tabIndex={tabIndex} className={s.btn} aria-label={label} aria-haspopup="menu" aria-expanded={false} onClick={() => setWanted(true)}>
      <Icon name="more" />
    </button>
  )
}

/** Only visible while dragging: drop here to make a page top-level (at the end). */
function TopLevelDrop({ spaceId }: { spaceId: string }) {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: `top:${spaceId}` })
  if (!active) return null
  return <div ref={setNodeRef} className={cx(s.topDrop, isOver && s.over)} data-testid="top-drop" data-over={isOver}>Move to top level</div>
}
