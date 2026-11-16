import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import * as Y from 'yjs'
import { useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getNode, getTrashed, publishNode, restoreBranch, updateNode, type NodeDetail, type Trashed } from '../api/nodes'
import { getVersion, listVersions, restoreVersion } from '../api/versions'
import { getMe, getMySpaces } from '../api/spaces'
import { DetailsPanel, TopBar, useShellSlots } from '../app/ShellSlots'
import PagePanel from '../comments/PagePanel'
import { toBase64 } from '../editor/base64'
import { openContent, RECOVERED_NOTICE, useAutosave, type Opened, type SaveState } from '../editor/autosave'
import Editor, { useKfEditor } from '../editor/Editor'
import { extractText } from '../editor/extractText'
import SaveIndicator, { ReadOnlyTag, SaveNotice } from '../editor/SaveIndicator'
import { useEndSessionOnLeave } from '../editor/session'
import SoftLockBanner, { TakenOverBanner, useEditLock, type LockMode } from '../editor/SoftLockBanner'
import DiffView from '../history/DiffView'
import HistoryPanel, { type Viewing } from '../history/HistoryPanel'
import VersionBar from '../history/VersionBar'
import { readPref, savePref } from '../team/detailsPref'
import Icon from '../ui/Icon'
import { ActionButton, ActionLink, ScreenMessage } from '../ui/States'
import { timeAgo } from '../ui/timeAgo'
import { toast } from '../ui/Toast'
import Breadcrumbs from './Breadcrumbs'
import s from './Page.module.css'
import PageMenu from './PageMenu'
import Properties from './Properties'

interface Slots {
  head: HTMLElement | null // top bar, next to the actions
  banners: HTMLElement | null // between the top bar and the page
}

const SCREEN = 'page' // the details panel's remembered state

export default function PageView() {
  const { nodeId = '' } = useParams()
  const qc = useQueryClient()
  const { detailsOpen, setDetailsOpen } = useShellSlots()
  const node = useQuery({ queryKey: ['node', nodeId], queryFn: () => getNode(nodeId), retry: false })
  // QA-33: a 404 may be a trashed page; ask where it went (404 again for pages that really don't exist or aren't mine to see).
  const gone = !node.data && node.error instanceof ApiError && node.error.status === 404
  const trashed = useQuery({ queryKey: ['trashed', nodeId], queryFn: () => getTrashed(nodeId), enabled: gone, retry: false })
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const canEditNode = node.data?.access === 'EDIT'
  const versions = useQuery({ queryKey: ['versions', nodeId], queryFn: () => listVersions(nodeId), enabled: canEditNode })
  const [title, setTitle] = useState('')
  // QA-42: the title wraps over as many lines as it needs (a one-line input cut long titles mid-word)
  const titleBox = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const fit = () => {
      const el = titleBox.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [title, detailsOpen])
  const [head, setHead] = useState<HTMLElement | null>(null)
  const [banners, setBanners] = useState<HTMLElement | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lockMode, setLockMode] = useState<LockMode>('checking')
  const [panel, setPanel] = useState<'details' | 'history'>('details')
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [contentKey, setContentKey] = useState(0) // bumped after a restore: the editor opens again on the server's state
  const [compareError, setCompareError] = useState('')
  const currentState = useRef<() => string>(() => '') // the open page's state, for "Compare with current"

  // Optimistic while loading, so the column does not jump when the panel appears; a failed load or a title-only page has none.
  const allowPanel = node.data ? node.data.access !== 'TITLE_ONLY' : !node.isError
  // Open by default, remembered per screen; closed again when leaving so the next screen starts without it.
  useEffect(() => {
    setDetailsOpen(allowPanel && readPref(SCREEN))
    return () => setDetailsOpen(false)
  }, [allowPanel, setDetailsOpen])
  useEffect(() => {
    setPanel('details')
    setViewing(null)
  }, [nodeId])
  // A save that just finished: "last edited" moves to me, now. Patched in the cache (GET /api/nodes/{id} also writes the
  // user's recent list, so it must not run after every autosave).
  const was = useRef<SaveState>('saved')
  useEffect(() => {
    const done = was.current !== 'saved' && saveState === 'saved'
    was.current = saveState
    if (!done || !me.data) return
    const who = { id: me.data.id, name: me.data.fullName || me.data.email.split('@')[0], avatarUrl: me.data.profilePicture ?? null }
    qc.setQueryData<NodeDetail>(['node', nodeId], (n) => n && { ...n, contentUpdatedAt: new Date().toISOString(), updatedBy: who })
  }, [saveState, nodeId, qc, me.data])

  const restore = useMutation({
    mutationFn: (id: string) => restoreVersion(id),
    onSuccess: async () => {
      setViewing(null)
      setContentKey((k) => k + 1)
      await qc.invalidateQueries({ queryKey: ['versions', nodeId] })
      await qc.invalidateQueries({ queryKey: ['node', nodeId] })
    },
  })
  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => updateNode(v.id, { title: v.title }),
    onSuccess: async (updated) => {
      qc.setQueryData(['node', updated.id], updated) // by its own id: the user may be on another page by now
      await qc.invalidateQueries({ queryKey: ['tree', updated.spaceId] })
    },
  })
  const publish = useMutation({
    mutationFn: () => publishNode(nodeId),
    onSuccess: async (updated) => {
      qc.setQueryData(['node', nodeId], updated)
      await Promise.all([qc.invalidateQueries({ queryKey: ['tree', updated.spaceId] }), qc.invalidateQueries({ queryKey: ['versions', nodeId] })])
    },
  })

  // The field follows the server's title, but never drops what is being typed (a save answering mid-word).
  const synced = useRef({ id: '', title: '' })
  useEffect(() => {
    const server = node.data?.title ?? ''
    const prev = synced.current
    setTitle((t) => (prev.id !== nodeId || t === prev.title ? server : t))
    synced.current = { id: nodeId, title: server }
  }, [node.data?.title, nodeId])

  // QA-11: the title saves like the content: ~1 s after typing stops, at once on blur/Enter, and when the page is left.
  const titleDirty = node.data?.access === 'EDIT' && title.trim() !== node.data.title
  const titleSaving = titleDirty || rename.isPending
  const saveTitle = rename.mutate
  useEffect(() => {
    if (!titleDirty) return
    const timer = setTimeout(() => saveTitle({ id: nodeId, title }), 1000)
    return () => clearTimeout(timer)
  }, [title, titleDirty, nodeId, saveTitle])
  const waitingTitle = useRef<{ id: string; title: string } | null>(null)
  useEffect(() => {
    waitingTitle.current = titleDirty ? { id: nodeId, title } : null
  })
  useEffect(() => () => {
    if (waitingTitle.current) saveTitle(waitingTitle.current)
  }, [nodeId, saveTitle])
  useEffect(() => {
    if (!titleSaving) return
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // older browsers need this to show the "Leave page?" prompt
    }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [titleSaving])

  const lastPublished = useMemo(
    () => (versions.data ?? []).filter((v) => v.kind === 'PUBLISHED').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [versions.data],
  )

  // Only a page that never loaded is replaced by an error. If a later refresh fails (trashed, archived, locked or
  // access removed meanwhile), the editor stays mounted so nothing typed is lost; the server's words go above it.
  if (!node.data) {
    if (node.isLoading) {
      return (
        <div className={s.column} aria-busy="true" aria-label="Loading page">
          <span className={`${s.skel} ${s.skelIcon}`} /><span className={`${s.skel} ${s.skelTitle}`} />
          {[100, 92, 96].map((w) => <span key={w} className={`${s.skel} ${s.skelLine}`} style={{ width: `${w}%` }} />)}
        </div>
      )
    }
    if (gone && trashed.isPending) return <div className={s.column} aria-busy="true" aria-label="Loading page" />
    if (gone && trashed.data) return <TrashedPage nodeId={nodeId} t={trashed.data} />
    const code = node.error instanceof ApiError ? node.error.status : 0
    return (
      <div className={s.state}>
        <p role="alert">{code === 404 ? 'This page does not exist.' : code === 403 ? "You don't have access to this page." : 'Could not load this page.'}</p>
        {code !== 404 && code !== 403 && <p><button type="button" className={s.link} onClick={() => void node.refetch()}>Try again</button></p>}
      </div>
    )
  }
  const n = node.data
  const canEdit = n.access === 'EDIT'
  const editing = canEdit && n.status === 'ACTIVE'
  const space = spaces.data?.find((x) => x.id === n.spaceId)
  const readingOnly = lockMode === 'blocked' || lockMode === 'taken' || lockMode === 'readonly' || lockMode === 'denied'
  const published = n.publishState === 'PUBLISHED'
  // Draft, unsaved typing, or newer than the last published version. A published page with no version on record counts as clean.
  const changes = !published || (saveState !== 'saved' && saveState !== 'recovered') || (!!lastPublished && Date.parse(n.contentUpdatedAt) > Date.parse(lastPublished.createdAt))

  const toggleDetails = () => {
    if (detailsOpen) {
      if (panel === 'details') savePref(false, SCREEN)
      setPanel('details')
      setViewing(null)
      setDetailsOpen(false)
    } else {
      savePref(true, SCREEN)
      setDetailsOpen(true)
    }
  }
  const toggleHistory = () => {
    if (detailsOpen && panel === 'history') {
      setPanel('details')
      setViewing(null)
    } else {
      setPanel('history')
      setDetailsOpen(true)
    }
  }
  async function compare() {
    if (!lastPublished) return
    setCompareError('')
    setPanel('history')
    setDetailsOpen(true)
    try {
      const old = await getVersion(lastPublished.id)
      setViewing({ version: lastPublished, number: null, previousNumber: null, state: currentState.current(), previousState: old.state, canRestore: false, against: 'current' })
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : 'Could not open the published version.')
    }
  }

  return (
    <div data-bleed>
      <TopBar>
        <Breadcrumbs
          team={space?.teamId && space.teamName ? { id: space.teamId, name: space.teamName } : null}
          spaceName={space?.name}
          crumbs={n.breadcrumbs}
          current={n.title}
        />
        <span className={s.actions}>
          <span ref={setHead} />
          {readingOnly && canEdit && <ReadOnlyTag />}
          {n.access !== 'TITLE_ONLY' && (
            <button type="button" className={s.iconBtn} aria-label="Version history" title="Version history" aria-pressed={detailsOpen && panel === 'history'} onClick={toggleHistory}>
              <Icon name="history" />
            </button>
          )}
          {editing && changes && !readingOnly && (
            <button type="button" className={`${s.btn} ${s.primary}`} disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : 'Publish'}</button>
          )}
          {published && !changes && <span className={s.publishedText}><Icon name="check" />Published</span>}
          <PageMenu node={n} personal={space?.ownerType === 'USER'} unsaved={saveState !== 'saved' && saveState !== 'recovered'} />
          {allowPanel && (
            <button type="button" className={s.iconBtn} aria-label="Details" title="Details" aria-pressed={detailsOpen && panel === 'details'} onClick={toggleDetails}>
              <Icon name="panel-right" />
            </button>
          )}
        </span>
      </TopBar>

      {viewing && <VersionBar viewing={viewing} onBack={() => setViewing(null)} />}
      <div ref={setBanners} className={s.banners} />
      <article className={s.column}>
        {node.isError && <p role="alert" className={s.error}>{node.error.message}</p>}
        {publish.error && <p role="alert" className={s.error}>{publish.error.message}</p>}
        {compareError && <p role="alert" className={s.error}>{compareError}</p>}
        <div className={s.iconTile} aria-hidden="true"><Icon name="doc-lines" size={26} /></div>
        <h1 className="sr-only">{title || 'Untitled'}</h1>
        <textarea
          ref={titleBox}
          rows={1}
          className={s.title}
          aria-label="Page title"
          placeholder="Untitled"
          maxLength={200}
          value={title}
          readOnly={!canEdit}
          onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
          onBlur={() => titleDirty && rename.mutate({ id: n.id, title })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        />
        {rename.error && <p role="alert" className={s.error}>{rename.error.message}</p>}
        {n.status === 'ARCHIVED' && <p className={s.note} role="status">This page is archived and read-only.</p>}
        {n.access === 'TITLE_ONLY' ? (
          <p className={s.note}>You can see this page's title but not its content.</p>
        ) : (
          <>
            <Properties node={n} canEdit={canEdit} changes={changes} canCompare={editing && !!lastPublished} onCompare={() => void compare()} />
            {viewing && <DiffView state={viewing.state} previousState={viewing.previousState} authors={viewing.version.authors} />}
            {me.data ? (
              /* hidden, not unmounted: the editor keeps saving what was typed */
              <div hidden={!!viewing}>
                <PageContent
                  key={`${n.id}:${contentKey}`} node={n} userId={me.data.id} slots={{ head, banners }}
                  onSaveState={setSaveState} onLock={setLockMode} stateRef={currentState} titleSaving={titleSaving}
                />
              </div>
            ) : (
              <div aria-busy="true" aria-label="Loading the page">
                {[100, 92, 96].map((w) => <span key={w} className={`${s.skel} ${s.skelLine}`} style={{ width: `${w}%` }} />)}
              </div>
            )}
          </>
        )}
      </article>

      {detailsOpen && allowPanel && (
        <DetailsPanel>
          {panel === 'history' ? (
            <HistoryPanel
              nodeId={n.id}
              canEdit={editing}
              viewing={viewing}
              onView={setViewing}
              getCurrentState={() => currentState.current()}
              restoring={restore.isPending}
              restoreError={restore.error?.message ?? ''}
              onRestore={(id) => restore.mutate(id)}
              onClose={() => { setPanel('details'); setViewing(null); setDetailsOpen(false) }}
            />
          ) : (
            <PagePanel nodeId={n.id} spaceId={n.spaceId} canEdit={editing} onClose={toggleDetails} />
          )}
        </DetailsPanel>
      )}
    </div>
  )
}

/** QA-33: what a trashed page (or a sub-page of a trashed page) shows instead of "does not exist". */
function TrashedPage({ nodeId, t }: { nodeId: string; t: Trashed }) {
  const qc = useQueryClient()
  const restore = useMutation({
    mutationFn: () => restoreBranch(t.rootId),
    onSuccess: async ({ movedToTop }) => {
      if (movedToTop) toast('It was restored to the top level of its space, because its parent is gone.')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tree', t.spaceId] }),
        qc.invalidateQueries({ queryKey: ['trash', t.spaceId] }),
        qc.invalidateQueries({ queryKey: ['node', nodeId] }),
      ])
      qc.removeQueries({ queryKey: ['trashed', nodeId] })
    },
  })
  const what = t.rootId === nodeId ? 'It was' : `“${t.rootTitle || 'Untitled'}” and its sub-pages were`
  const when = timeAgo(t.at)
  return (
    <ScreenMessage
      title="This page is in the trash"
      action={<>
        {t.canRestore && (
          <ActionButton onClick={() => restore.mutate()}>
            {restore.isPending ? 'Restoring…' : t.rootId === nodeId ? 'Restore' : `Restore “${t.rootTitle || 'Untitled'}”`}
          </ActionButton>
        )}
        <ActionLink to={`/s/${t.spaceId}/trash`}>Open the trash</ActionLink>
        {restore.error && <p role="alert">{restore.error.message}</p>}
      </>}
    >
      {what} moved to the trash{t.by ? ` by ${t.by.name}` : ''}{when ? ` ${when}` : ''}. {t.canRestore ? 'Restore it to read and edit it again.' : 'Ask an editor to restore it.'}
    </ScreenMessage>
  )
}

/** Loads the content (server copy + this user's unconfirmed local copies), then shows the editor. */
function PageContent({ node, userId, slots, onSaveState, onLock, stateRef, titleSaving }: {
  node: NodeDetail
  userId: string
  slots: Slots
  titleSaving: boolean
  onSaveState: (s: SaveState) => void
  onLock: (m: LockMode) => void
  stateRef: MutableRefObject<() => string>
}) {
  const canEdit = node.access === 'EDIT'
  const [opened, setOpened] = useState<Opened>()
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    setOpened(undefined)
    setFailed(false)
    openContent(node.id, canEdit, userId).then(
      (o) => (live ? setOpened(o) : o.release()), // nobody will use it: its slot must not look alive
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [node.id, canEdit, userId, reloads])

  if (failed) {
    return (
      <p role="alert" className={s.error}>
        Could not load this page's content. <button type="button" className={s.link} onClick={() => setReloads((r) => r + 1)}>Try again</button>
      </p>
    )
  }
  return (
    <>
      {notice && slots.banners && createPortal(<SaveNotice onDismiss={() => setNotice('')}>{notice}</SaveNotice>, slots.banners)}
      {opened ? (
        <PageEditor
          node={node}
          opened={opened}
          slots={slots}
          onSaveState={onSaveState}
          onLock={onLock}
          stateRef={stateRef}
          titleSaving={titleSaving}
          onReload={() => setReloads((r) => r + 1)}
          // The local copy is now a private version: say so and load what the server has.
          onRecovered={() => {
            setNotice(RECOVERED_NOTICE)
            setReloads((r) => r + 1)
          }}
        />
      ) : (
        <div aria-busy="true" aria-label="Loading content">
          {[100, 90, 95].map((w) => <span key={w} className={`${s.skel} ${s.skelLine}`} style={{ width: `${w}%` }} />)}
        </div>
      )}
    </>
  )
}

function PageEditor({ node, opened, slots, onRecovered, onReload, onSaveState, onLock, stateRef, titleSaving }: {
  node: NodeDetail
  opened: Opened
  slots: Slots
  titleSaving: boolean
  onRecovered: () => void
  /** Opens the content again from the server. */
  onReload: () => void
  onSaveState: (s: SaveState) => void
  onLock: (m: LockMode) => void
  stateRef: MutableRefObject<() => string>
}) {
  const canEdit = node.access === 'EDIT'
  const lock = useEditLock(node.id, canEdit)
  const editable = canEdit && lock.mode === 'editing'
  const [uploadError, setUploadError] = useState('')
  const files = useMemo(() => ({ nodeId: node.id, onError: setUploadError }), [node.id])
  const editor = useKfEditor(opened.ydoc, 'Me', editable, files)
  useEndSessionOnLeave(node.id, canEdit)
  const save = useAutosave(node.id, opened, () => extractText(editor.document), canEdit)
  const problem = save.state === 'failed' ? `Not saved: ${save.message}` : save.state === 'retrying' || save.state === 'offline' ? save.message : undefined

  useEffect(() => {
    stateRef.current = () => toBase64(Y.encodeStateAsUpdate(opened.ydoc))
    return () => { stateRef.current = () => '' }
  }, [opened.ydoc, stateRef])

  useEffect(() => {
    onSaveState(save.state)
    return () => onSaveState('saved') // nothing is unsaved once this editor is gone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.state])

  useEffect(() => {
    onLock(lock.mode)
    return () => onLock('checking')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.mode])

  useEffect(() => {
    if (save.state === 'recovered') onRecovered()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.state])

  return (
    <>
      {canEdit && lock.mode !== 'blocked' && lock.mode !== 'readonly' && slots.head && createPortal(<SaveIndicator state={titleSaving && save.state === 'saved' ? 'saving' : save.state} local={save.local} />, slots.head)}
      {uploadError && slots.banners && createPortal(<SaveNotice onDismiss={() => setUploadError('')}>{uploadError}</SaveNotice>, slots.banners)}
      {problem && slots.banners && createPortal(<SaveNotice>{problem}</SaveNotice>, slots.banners)}
      {lock.mode === 'blocked' && slots.banners && createPortal(
        <SoftLockBanner holder={lock.holder} onReadOnly={lock.openReadOnly} onEditAnyway={lock.editAnyway} />,
        slots.banners,
      )}
      {lock.mode === 'taken' && slots.banners && createPortal(
        <TakenOverBanner holder={lock.holder} saved={save.state === 'saved' || save.state === 'recovered'} onReload={onReload} onTakeBack={lock.editAnyway} />,
        slots.banners,
      )}
      {!canEdit && <p className={s.note}>{node.status === 'ARCHIVED' ? 'This page is archived and read-only.' : node.locked ? 'This page is locked.' : 'You can read this page but not edit it.'}</p>}
      {lock.mode === 'readonly' && <p className={s.note}>Opened read-only: {lock.holder} is editing this page.</p>}
      {lock.mode === 'denied' && <p className={s.error} role="alert">You can no longer edit this page{lock.reason ? `: ${lock.reason}` : '.'}</p>}
      <Editor editor={editor} editable={editable} />
    </>
  )
}
