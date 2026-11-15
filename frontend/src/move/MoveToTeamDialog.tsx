import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSubtreeCount, getTree, moveToTeam, type NodeDetail } from '../api/nodes'
import { getMySpaces } from '../api/spaces'
import { buildTree, type TreeNode } from '../tree/buildTree'
import Icon from '../ui/Icon'
import TeamTile from '../ui/TeamTile'
import s from './MoveToTeam.module.css'

interface Props {
  node: Pick<NodeDetail, 'id' | 'spaceId' | 'title'>
  onClose: () => void
}

const flatten = (list: TreeNode[], depth = 0): { n: TreeNode; depth: number }[] =>
  list.flatMap((n) => [{ n, depth }, ...flatten(n.children, depth + 1)])

/** Move a private page (and its sub-pages) into a team project (wireframe MoveToTeam, domain spec 4.4). */
export default function MoveToTeamDialog({ node, onClose }: Props) {
  const qc = useQueryClient()
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [teamId, setTeamId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [parentId, setParentId] = useState('') // '' = top of the project
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const count = useQuery({ queryKey: ['subtree-count', node.id], queryFn: () => getSubtreeCount(node.id) })
  // Only projects where I can edit are offered.
  const projects = useMemo(
    () => (spaces.data ?? []).filter((s) => s.ownerType === 'TEAM' && (s.myRole === 'ADMIN' || s.myRole === 'EDITOR')),
    [spaces.data],
  )
  const teams = useMemo(() => [...new Map(projects.map((s) => [s.teamId!, s.teamName ?? 'Team'])).entries()], [projects])
  const team = teamId || teams[0]?.[0] || ''
  const inTeam = projects.filter((s) => s.teamId === team)
  const space = inTeam.find((s) => s.id === spaceId) ?? inTeam[0]
  const tree = useQuery({ queryKey: ['tree', space?.id], queryFn: () => getTree(space!.id), enabled: !!space })
  const rows = useMemo(() => flatten(buildTree(tree.data ?? [])), [tree.data])
  const parentTitle = rows.find((r) => r.n.id === parentId)?.n.title ?? space?.name

  useEffect(() => {
    const d = ref.current!
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
    return () => {
      if (typeof d.close === 'function') d.close()
    }
  }, [])

  async function submit() {
    if (!space) return
    setBusy(true)
    setError('')
    try {
      await moveToTeam(node.id, { spaceId: space.id, parentId: parentId || null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['node', node.id] }),
        qc.invalidateQueries({ queryKey: ['tree', node.spaceId] }),
        qc.invalidateQueries({ queryKey: ['tree', space.id] }),
      ])
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
      setBusy(false)
    }
  }

  const subs = count.data?.count ?? 0
  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
      onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className={s.head}>
        <h2 id={`${id}-t`} className={s.title}>Move “{node.title || 'Untitled'}” to a team</h2>
        <p id={`${id}-d`} className={s.sub}>
          <Icon name="doc-lines" size={14} />From your private space
          {subs > 0 && <span className={s.badge}>+ {subs} sub-page{subs === 1 ? '' : 's'}</span>}
        </p>
      </div>
      <div className={s.body}>
        {spaces.isSuccess && projects.length === 0 ? (
          <p role="status" className={s.none}>You can't edit any team space yet. Ask a team admin to make you an editor first.</p>
        ) : (
          <>
            <div className={s.pickers}>
              <label className={s.field}>
                <span className={s.label}>Team</span>
                <span className={s.select}>
                  <TeamTile name={teams.find(([tid]) => tid === team)?.[1] ?? '?'} size={18} />
                  <select value={team} onChange={(e) => { setTeamId(e.target.value); setSpaceId(''); setParentId('') }}>
                    {teams.map(([tid, name]) => <option key={tid} value={tid}>{name}</option>)}
                  </select>
                  <Icon name="chevron-down" size={14} />
                </span>
              </label>
              <label className={s.field}>
                <span className={s.label}>Space</span>
                <span className={s.select}>
                  <span className={s.spaceDot} aria-hidden="true" />
                  <select value={space?.id ?? ''} onChange={(e) => { setSpaceId(e.target.value); setParentId('') }}>
                    {inTeam.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <Icon name="chevron-down" size={14} />
                </span>
              </label>
            </div>
            <fieldset className={s.field}>
              <legend className={s.label}>Put it under</legend>
              <div className={s.tree}>
                <label className={s.opt}>
                  <input type="radio" name={`${id}-p`} checked={parentId === ''} onChange={() => setParentId('')} />
                  <span className={s.radio} aria-hidden="true" />Top of {space?.name}
                </label>
                {tree.isPending && !!space && <span className={s.loading}>Loading pages…</span>}
                {rows.map(({ n, depth }) => (
                  <label key={n.id} className={s.opt} style={{ paddingLeft: 10 + 24 * depth }}>
                    <input type="radio" name={`${id}-p`} checked={parentId === n.id} disabled={n.titleOnly} onChange={() => setParentId(n.id)} />
                    <span className={s.radio} aria-hidden="true" /><span className={s.dot} aria-hidden="true" />
                    <span className={s.optText}>{n.title || 'Untitled'}{n.titleOnly && " (you can't edit here)"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <section aria-labelledby={`${id}-w`} className={s.what}>
              <h3 id={`${id}-w`} className={s.whatTitle}>What happens when you move it</h3>
              <p className={s.w}><Icon name="check" size={14} />Content, files, tags and comments come along.</p>
              <p className={s.w}><Icon name="check" size={14} />Everyone who can see “{parentTitle}” can see it.</p>
              <p className={s.w}><Icon name="check" size={14} />Your earlier versions stay private. The team's history starts at “Published to team”.</p>
              <p className={`${s.w} ${s.no}`}><Icon name="info" size={14} />It can't be moved back to your private space later. You can copy it instead.</p>
            </section>
          </>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      <div className={s.foot}>
        <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={s.primary} disabled={busy || !space} onClick={() => void submit()}>
          <Icon name="move-to" size={14} />{busy ? 'Moving…' : 'Move to team'}
        </button>
      </div>
    </dialog>
  )
}
