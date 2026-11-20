import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getTree, type NodeSummary } from '../api/nodes'
import { canEditSpace, getMySpaces } from '../api/spaces'
import { TopBar } from '../app/ShellSlots'
import { buildTree, type TreeNode } from '../tree/buildTree'
import PageRow from '../dashboard/PageRow'
import h from '../dashboard/Home.module.css'
import { useCreatePage } from '../tree/useCreatePage'
import Icon from '../ui/Icon'
import { ActionButton, ActionLink, ScreenMessage, ScreenSkeleton } from '../ui/States'
import s from './SpaceHome.module.css'

/** /s/:spaceId: the space's own page: its name and the list of its pages; an empty space shows New page (QA-17). */
export default function SpaceHome() {
  const { spaceId = '' } = useParams()
  const tree = useQuery({ queryKey: ['tree', spaceId], queryFn: () => getTree(spaceId), retry: false })
  if (tree.isLoading) return <ScreenSkeleton label="Opening the space" />
  if (!tree.data) {
    const code = tree.error instanceof ApiError ? tree.error.status : 0
    return code === 404 || code === 403
      ? <ScreenMessage alert title="You can’t open this space" action={<ActionLink to="/">Go to Home</ActionLink>}>It was deleted, or you are not a member of its team.</ScreenMessage>
      : <ScreenMessage alert title="Could not open this space" action={<ActionButton onClick={() => void tree.refetch()}>Try again</ActionButton>}>The server did not answer. Check your connection, then try again.</ScreenMessage>
  }
  return <SpaceView spaceId={spaceId} pages={inTreeOrder(buildTree(tree.data))} />
}

/** Depth-first, so every page follows its parent; each one carries its parent's title. */
function inTreeOrder(list: TreeNode[], parent = ''): (NodeSummary & { parentTitle: string })[] {
  return list.flatMap((n) => [{ ...n, parentTitle: parent }, ...inTreeOrder(n.children, n.title || 'Untitled')])
}

function SpaceView({ spaceId, pages }: { spaceId: string; pages: (NodeSummary & { parentTitle: string })[] }) {
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const space = spaces.data?.find((x) => x.id === spaceId)
  const { create, message } = useCreatePage(spaceId)
  const editable = !!space && canEditSpace(space)
  const who = space?.teamName ?? 'the team'
  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb">
          {space?.teamId && <><Link to={`/teams/${space.teamId}`}>{space.teamName}</Link><span aria-hidden="true">/</span></>}
          <span className={s.here} aria-current="page">{space?.name ?? 'Space'}</span>
        </nav>
      </TopBar>
      <h1 className={s.title}>{space?.name ?? 'Space'}</h1>
      {pages.length > 0 ? (
        <>
          {editable && <button type="button" className={s.mainBtn} onClick={() => void create(null)}><Icon name="plus" />New page</button>}
          <ul className={`${h.list} ${s.pages}`} aria-label={`Pages in ${space?.name ?? 'this space'}`}>
            {pages.map((p) => (
              <PageRow key={p.id} id={p.id} title={p.title} color={p.color} location={p.parentTitle && `in ${p.parentTitle}`}
                status={p.titleOnly ? null : p.publishState} when={null} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className={s.help}>
            {space?.ownerType === 'USER'
              ? 'No pages yet. Write the first one; only you can see pages here.'
              : editable
                ? `No pages yet. Write the first one; everyone in ${who} can read it.`
                : `No pages yet. An editor of ${who} can write the first one.`}
          </p>
          {editable && <button type="button" className={s.mainBtn} onClick={() => void create(null)}><Icon name="plus" />New page</button>}
        </>
      )}
      {message && <p role="alert" className={s.error}>{message}</p>}
    </div>
  )
}
