// The board screen (`/app/b/:id`). Loaded lazily: only board routes pull in Excalidraw (BoardCanvas, lazier still).
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams } from 'react-router-dom'
import * as Y from 'yjs'
import { ApiError } from '../api/client'
import { getContent } from '../api/content'
import { getNode, type NodeDetail } from '../api/nodes'
import { getMe, getMySpaces } from '../api/spaces'
import { nodePath } from '../app/nodePath'
import { TopBar } from '../app/ShellSlots'
import { fromBase64 } from '../editor/base64'
import { TOO_MANY, useCollab } from '../editor/collab'
import type { SaveState } from '../editor/autosave'
import SaveIndicator, { ReadOnlyTag } from '../editor/SaveIndicator'
import { userColor } from '../editor/userColor'
import Breadcrumbs from '../page/Breadcrumbs'
import PageMenu from '../page/PageMenu'
import Presence from '../page/Presence'
import ps from '../page/Page.module.css'
import Icon from '../ui/Icon'
import { ScreenSkeleton } from '../ui/States'
import { createUndo, type BoardUndo } from './binding/undo'
import { EMPTY_BOARD_STATE } from './format'
import s from './Board.module.css'

const BoardCanvas = lazy(() => import('./BoardCanvas'))

export const EMPTY_HINT = 'Draw with the pen, add shapes, or paste Mermaid code.'
const TOO_LARGE_BOARD = 'This board is full. Continue in a new board.' // WB 7.9 (the action comes with Task 5.2)

export default function BoardView() {
  const { nodeId = '' } = useParams()
  const node = useQuery({ queryKey: ['node', nodeId], queryFn: () => getNode(nodeId), retry: false })
  const content = useQuery({ queryKey: ['board-content', nodeId], queryFn: () => getContent(nodeId), retry: false, staleTime: Infinity })
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })

  const failed = node.error ?? content.error
  if (failed) {
    const code = failed instanceof ApiError ? failed.status : 0
    return (
      <div className={ps.state}>
        <p role="alert">{code === 403 ? "You don't have access to this board." : code === 404 || code === 410 ? 'This board was deleted.' : 'Could not load this board.'}</p>
      </div>
    )
  }
  if (!node.data || !content.data || !me.data) return <ScreenSkeleton label="Loading board" />
  if (node.data.type !== 'BOARD') return <Navigate to={nodePath(node.data.id, node.data.type)} replace />
  return <LiveBoard key={`${nodeId}:${content.data.contentEpoch}`} node={node.data} state={content.data.state} epoch={content.data.contentEpoch}
    user={{ id: me.data.id, name: me.data.fullName || me.data.email.split('@')[0] }} />
}

function LiveBoard({ node, state, epoch, user }: { node: NodeDetail; state: string; epoch: number; user: { id: string; name: string } }) {
  const qc = useQueryClient()
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  // Every copy of a board starts from the same root (D6), then the stored state.
  const doc = useMemo(() => {
    const d = new Y.Doc()
    Y.applyUpdate(d, fromBase64(EMPTY_BOARD_STATE))
    if (state) Y.applyUpdate(d, fromBase64(state))
    return d
  }, [state])
  // Made in an effect, not a memo: React's dev double mount would otherwise leave a destroyed history in use.
  const [undo, setUndo] = useState<BoardUndo | null>(null)
  useEffect(() => {
    const u = createUndo(doc)
    setUndo(u)
    return () => u.destroy()
  }, [doc])

  const collab = useCollab(node.id, doc, user.id, true, epoch)
  const editable = node.access === 'EDIT' && collab.access !== 'VIEW' && !collab.problem && undo !== null
  const saveState = useSaveState(collab.provider)
  const [live, setLive] = useState('')
  const [head, setHead] = useState<HTMLElement | null>(null)

  useEffect(() => {
    collab.provider?.awareness?.setLocalStateField('user', { name: user.name, color: userColor(user.id) })
  }, [collab.provider, user.id, user.name])
  useEffect(() => {
    // restored since it was opened: load it again; gone: the node query says why
    if (collab.problem === 'restored') void qc.invalidateQueries({ queryKey: ['board-content', node.id] })
    if (collab.problem === 'gone') void qc.invalidateQueries({ queryKey: ['node', node.id] })
  }, [collab.problem, node.id, qc])

  const space = spaces.data?.find((x) => x.id === node.spaceId)
  const notice = collab.problem === 'too-many' ? TOO_MANY : collab.problem === 'too-large' ? TOO_LARGE_BOARD : collab.problem === 'gone' ? collab.message : null
  return (
    <div data-bleed className={s.board} data-board data-ready={collab.provider ? 'true' : 'false'} data-live={live}>
      <TopBar>
        <Breadcrumbs
          team={space?.teamId && space.teamName ? { id: space.teamId, name: space.teamName } : null}
          spaceName={space?.name}
          crumbs={node.breadcrumbs}
          current={node.title}
          colour={node.color ?? 'gray'}
        />
        <span className={ps.actions}>
          <span ref={setHead} />
          {node.access === 'VIEW' && <ReadOnlyTag label="View only" />}
          {editable && (
            <>
              <button type="button" className={ps.iconBtn} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={() => undo?.undo()}><Icon name="undo" /></button>
              <button type="button" className={ps.iconBtn} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => undo?.redo()}><Icon name="redo" /></button>
            </>
          )}
          {node.access === 'EDIT' && <PageMenu node={node} unsaved={saveState !== 'saved'} label="Board actions" />}
        </span>
      </TopBar>
      {head && editable && createPortal(<SaveIndicator state={saveState} local={false} />, head)}
      {head && collab.provider?.awareness && createPortal(<Presence awareness={collab.provider.awareness} selfId={user.id} />, head)}
      {notice && <p role="alert" className={s.notice}>{notice}</p>}
      {undo && (
        <Suspense fallback={<ScreenSkeleton label="Loading board" />}>
          <BoardCanvas doc={doc} editable={editable} name={node.title || 'Untitled'} undo={undo} onLive={setLive} />
        </Suspense>
      )}
      {live === '' && <p className={s.hint}>{EMPTY_HINT}</p>}
    </div>
  )
}

/** Saved once the collaboration service has every change this tab made; offline while the session is down. */
function useSaveState(provider: HocuspocusProvider | null | undefined): SaveState {
  const [state, setState] = useState<SaveState>('saved')
  useEffect(() => {
    if (!provider) return
    let connected = provider.configuration.websocketProvider.status === 'connected'
    const update = () => setState(!connected ? 'offline' : provider.hasUnsyncedChanges ? 'saving' : 'saved')
    update()
    const onStatus = ({ status }: { status: string }) => {
      connected = status === 'connected'
      update()
    }
    provider.on('status', onStatus)
    provider.on('unsyncedChanges', update)
    provider.on('synced', update)
    return () => {
      provider.off('status', onStatus)
      provider.off('unsyncedChanges', update)
      provider.off('synced', update)
    }
  }, [provider])
  return state
}
