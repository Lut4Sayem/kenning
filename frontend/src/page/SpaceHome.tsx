import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getTree } from '../api/nodes'
import { buildTree } from '../tree/buildTree'
import { ActionButton, ActionLink, ScreenMessage, ScreenSkeleton } from '../ui/States'

/** /s/:spaceId (old space links): opens the project's first page. */
export default function SpaceHome() {
  const { spaceId = '' } = useParams()
  const tree = useQuery({ queryKey: ['tree', spaceId], queryFn: () => getTree(spaceId), retry: false })
  if (tree.isLoading) return <ScreenSkeleton label="Opening the space" />
  if (!tree.data) {
    const code = tree.error instanceof ApiError ? tree.error.status : 0
    return code === 404 || code === 403
      ? <ScreenMessage alert title="You can't open this space" action={<ActionLink to="/">Go to Home</ActionLink>}>It was deleted, or you are not a member of its team.</ScreenMessage>
      : <ScreenMessage alert title="Could not open this space" action={<ActionButton onClick={() => void tree.refetch()}>Try again</ActionButton>}>The server did not answer. Check your connection, then try again.</ScreenMessage>
  }
  const first = buildTree(tree.data).find((n) => n.type === 'PAGE') ?? tree.data.find((n) => n.type === 'PAGE')
  if (first) return <Navigate to={`/p/${first.id}`} replace />
  return <ScreenMessage title="No pages yet">Use the + next to this space in the sidebar to write the first page.</ScreenMessage>
}
