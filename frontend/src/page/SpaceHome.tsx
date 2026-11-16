import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getTree } from '../api/nodes'
import { canEditSpace, getMySpaces } from '../api/spaces'
import { TopBar } from '../app/ShellSlots'
import { buildTree } from '../tree/buildTree'
import { useCreatePage } from '../tree/useCreatePage'
import Icon from '../ui/Icon'
import { ActionButton, ActionLink, ScreenMessage, ScreenSkeleton } from '../ui/States'
import s from './SpaceHome.module.css'

/** /s/:spaceId: opens the space's first page; an empty space shows its name and a New page button (QA-17). */
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
  const first = buildTree(tree.data).find((n) => n.type === 'PAGE') ?? tree.data.find((n) => n.type === 'PAGE')
  if (first) return <Navigate to={`/p/${first.id}`} replace />
  return <EmptySpace spaceId={spaceId} />
}

function EmptySpace({ spaceId }: { spaceId: string }) {
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const space = spaces.data?.find((x) => x.id === spaceId)
  const { create, message } = useCreatePage(spaceId)
  const editable = !!space && canEditSpace(space)
  const who = space?.teamName ?? 'the team'
  const newPage = (cls: string) => (
    <button type="button" className={cls} onClick={() => void create(null)}><Icon name="plus" />New page</button>
  )
  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb">
          {space?.teamId && <><Link to={`/teams/${space.teamId}`}>{space.teamName}</Link><span aria-hidden="true">/</span></>}
          <span className={s.here} aria-current="page">{space?.name ?? 'Space'}</span>
        </nav>
        {editable && newPage(s.topBtn)}
      </TopBar>
      <h1 className={s.title}>{space?.name ?? 'Space'}</h1>
      <p className={s.help}>
        {space?.ownerType === 'USER'
          ? 'No pages yet. Write the first one; only you can see pages here.'
          : editable
            ? `No pages yet. Write the first one; everyone in ${who} can read it.`
            : `No pages yet. An editor of ${who} can write the first one.`}
      </p>
      {editable && newPage(s.mainBtn)}
      {message && <p role="alert" className={s.error}>{message}</p>}
    </div>
  )
}
