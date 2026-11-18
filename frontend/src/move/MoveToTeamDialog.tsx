import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSubtreeCount, getTree, moveNode, moveToTeam, type NodeDetail } from '../api/nodes'
import { getMySpaces } from '../api/spaces'
import { buildTree, type TreeNode } from '../tree/buildTree'
import Icon from '../ui/Icon'
import { dotColour } from '../ui/pageColour'
import TeamTile from '../ui/TeamTile'
import { toast } from '../ui/Toast'
import s from './MoveToTeam.module.css'

interface Props {
  node: Pick<NodeDetail, 'id' | 'spaceId' | 'title'>
  onClose: () => void
  /** 'space': "Move to…" for a team page: another place in its own team, any space (QA-12). Default: private page to a team. */
  mode?: 'team' | 'space'
}

/** Rows of the "Put it under" list; the page itself and its sub-pages are left out (it can't go inside itself). */
const flatten = (list: TreeNode[], skip: string, depth = 0): { n: TreeNode; depth: number }[] =>
  list.filter((n) => n.id !== skip).flatMap((n) => [{ n, depth }, ...flatten(n.children, skip, depth + 1)])

/** Move a page (and its sub-pages) into a team space: a private page to a team (domain spec 4.4), or a team page within its team. */
export default function MoveToTeamDialog({ node, onClose, mode = 'team' }: Props) {
  const qc = useQueryClient()
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [spaceId, setSpaceId] = useState('')
  const [find, setFind] = useState('')
  const [parentId, setParentId] = useState('') // '' = top of the project
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const count = useQuery({ queryKey: ['subtree-count', node.id], queryFn: () => getSubtreeCount(node.id) })
  const within = mode === 'space'
  const from = spaces.data?.find((s) => s.id === node.spaceId)
  // Only spaces where I can edit are offered; "Move to…" stays inside the page's own team.
  const projects = useMemo(
    () => (spaces.data ?? []).filter((s) => s.ownerType === 'TEAM' && (s.myRole === 'ADMIN' || s.myRole === 'EDITOR')
      && (!within || s.teamId === from?.teamId)),
    [spaces.data, within, from?.teamId],
  )
  // D-01 B: one list grouped by team, filtered by space or team name; picking a row picks both.
  const q = find.trim().toLowerCase()
  const shown = projects.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.teamName ?? '').toLowerCase().includes(q))
  const teams = [...new Map(shown.map((s) => [s.teamId!, s.teamName ?? 'Team'])).entries()]
  // "Move to…" starts on another space of the team (the usual reason to open it), else on the first one.
  const space = projects.find((s) => s.id === spaceId) ?? (within ? projects.find((s) => s.id !== node.spaceId) : undefined) ?? projects[0]
  const tree = useQuery({ queryKey: ['tree', space?.id], queryFn: () => getTree(space!.id), enabled: !!space })
  const rows = useMemo(() => flatten(buildTree(tree.data ?? []), node.id), [tree.data, node.id])
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
      if (within) await moveNode(node.id, { parentId: parentId || null, ...(space.id !== node.spaceId && { spaceId: space.id }) })
      else await moveToTeam(node.id, { spaceId: space.id, parentId: parentId || null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['node', node.id] }),
        qc.invalidateQueries({ queryKey: ['tree', node.spaceId] }),
        qc.invalidateQueries({ queryKey: ['tree', space.id] }),
      ])
      if (within) toast(`Moved “${node.title || 'Untitled'}” to ${space.name}`) // QA-61
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
        <h2 id={`${id}-t`} className={s.title}>Move “{node.title || 'Untitled'}” {within ? 'to…' : 'to a team'}</h2>
        <p id={`${id}-d`} className={s.sub}>
          <Icon name="doc-lines" size={14} />{within ? `From ${from?.name ?? 'its space'}` : 'From your private space'}
          {subs > 0 && <span className={s.badge}>+ {subs} sub-page{subs === 1 ? '' : 's'}</span>}
        </p>
      </div>
      <div className={s.body}>
        {spaces.isSuccess && projects.length === 0 ? (
          <p role="status" className={s.none}>{within ? "You can’t edit any space of this team." : "You can’t edit any team space yet. Ask a team admin to make you an editor first."}</p>
        ) : (
          <>
            <fieldset className={s.field}>
              <legend className={s.label}>Space</legend>
              <span className={s.select}>
                <Icon name="search" size={14} />
                <input type="search" aria-label="Find a space" placeholder="Find a space" value={find} onChange={(e) => setFind(e.target.value)} />
              </span>
              <div className={s.tree}>
                {teams.map(([tid, name]) => (
                  <div key={tid} role="group" aria-label={name}>
                    <p className={s.group}><TeamTile name={name} size={18} />{name}</p>
                    {shown.filter((x) => x.teamId === tid).map((x) => (
                      <label key={x.id} className={`${s.opt} ${s.spaceOpt}`}>
                        <input type="radio" name={`${id}-s`} checked={space?.id === x.id} onChange={() => { setSpaceId(x.id); setParentId('') }} />
                        <span className={s.spaceDot} aria-hidden="true" /><span className={s.optText}>{x.name}</span>
                        {x.id === node.spaceId && <span className={s.end}>Now here</span>}
                      </label>
                    ))}
                  </div>
                ))}
                {teams.length === 0 && <p className={s.none} role="status">No space matches “{find.trim()}”.</p>}
              </div>
            </fieldset>
            <fieldset className={s.field}>
              <legend className={s.label}>Put it under</legend>
              <div className={s.tree}>
                <label className={s.opt}>
                  <input type="radio" name={`${id}-p`} checked={parentId === ''} onChange={() => setParentId('')} />
                  <span className={s.radio} aria-hidden="true" />Top of {space?.name}
                </label>
                {tree.isPending && !!space && <span className={s.loading} role="status" aria-label="Loading pages">{[0, 1, 2].map((i) => <span key={i} className={s.skel} />)}</span>}
                {tree.isError && <p role="alert" className={s.loadError}>Could not load the pages of this space. <button type="button" className={s.retry} onClick={() => void tree.refetch()}>Try again</button></p>}
                {rows.map(({ n, depth }) => (
                  <label key={n.id} className={s.opt} style={{ paddingLeft: 10 + 24 * depth }}>
                    <input type="radio" name={`${id}-p`} checked={parentId === n.id} disabled={n.titleOnly} onChange={() => setParentId(n.id)} />
                    <span className={s.radio} aria-hidden="true" /><span className={s.dot} style={{ background: dotColour(n.color) }} aria-hidden="true" />
                    <span className={s.optText}>{n.title || 'Untitled'}{n.titleOnly && " (you can’t edit here)"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <section aria-labelledby={`${id}-w`} className={s.what}>
              <h3 id={`${id}-w`} className={s.whatTitle}>What happens when you move it</h3>
              {within ? (
                <>
                  <p className={s.w}><Icon name="check" size={14} />Its sub-pages, content, files, comments and history come along.</p>
                  <p className={s.w}><Icon name="check" size={14} />Everyone who can see “{parentTitle}” can see it.</p>
                </>
              ) : (
                <>
                  <p className={s.w}><Icon name="check" size={14} />Content, files, tags and comments come along.</p>
                  <p className={s.w}><Icon name="check" size={14} />Everyone who can see “{parentTitle}” can see it.</p>
                  <p className={s.w}><Icon name="check" size={14} />Your earlier versions stay private. The team’s history starts at “Published to team”.</p>
                  <p className={`${s.w} ${s.no}`}><Icon name="info" size={14} />It can’t be moved back to your private space later.</p>
                </>
              )}
            </section>
          </>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      <div className={s.foot}>
        <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={s.primary} disabled={busy || !space} onClick={() => void submit()}>
          <Icon name="move-to" size={14} />{busy ? 'Moving…' : within ? 'Move' : 'Move to team'}
        </button>
      </div>
    </dialog>
  )
}
