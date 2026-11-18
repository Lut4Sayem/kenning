import { useQueryClient } from '@tanstack/react-query'
import { useMatch, useNavigate } from 'react-router-dom'
import { getSubtreeCount, restoreBranch, trashNode, type NodeDetail } from '../api/nodes'
import { confirmTrash } from '../trash/ConfirmTrashDialog'
import { toast } from '../ui/Toast'

/**
 * Move to trash, the one flow used by the page menu and the top bar button (QA-64): confirm with the sub-page count,
 * trash, leave the page, then a toast with Undo (QA-33). Rejects with the server's message.
 */
export function useTrashPage(node: Pick<NodeDetail, 'id' | 'spaceId' | 'title'>) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isOpen = useMatch('/p/:nodeId')?.params.nodeId === node.id // the sidebar row's menu can trash a page that is not open
  return async () => {
    const { count } = await getSubtreeCount(node.id)
    if (!(await confirmTrash(node.title, count))) return
    await trashNode(node.id)
    await qc.invalidateQueries({ queryKey: ['tree', node.spaceId] })
    if (isOpen) navigate('/')
    else await qc.invalidateQueries({ queryKey: ['node'] }) // an open sub-page went with it: its refresh shows the server's notice
    toast(`Moved “${node.title || 'Untitled'}” to trash`, 'info', {
      action: {
        label: 'Undo',
        run: () => void restoreBranch(node.id)
          .then(async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['node', node.id] }),
              qc.invalidateQueries({ queryKey: ['tree', node.spaceId] }),
            ])
            navigate(`/p/${node.id}`)
          })
          .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not restore the page.', 'error')),
      },
    })
  }
}

/** Why the page can't be trashed right now (shown as the disabled control's tooltip), or undefined. */
export const trashBlocked = (node: Pick<NodeDetail, 'locked'>, unsaved: boolean) =>
  node.locked ? 'Unlock the page first' : unsaved ? 'Wait until the page is saved' : undefined
