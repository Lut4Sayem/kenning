import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import * as Y from 'yjs'
import { useLocation, useParams } from 'react-router-dom'
import { dotColour } from '../ui/pageColour'
import { ApiError } from '../api/client'
import { getNode, getTrashed, publishNode, restoreBranch, unpublishNode, updateNode, type NodeDetail, type Trashed } from '../api/nodes'
import { getVersion, listVersions, restoreVersion } from '../api/versions'
import { getMe, getMySpaces, type MySpace } from '../api/spaces'
import { DetailsPanel, TopBar, useShellSlots } from '../app/ShellSlots'
import PagePanel from '../comments/PagePanel'
import { toBase64 } from '../editor/base64'
import { LOST_NOTICE, openContent, RECOVERED_NOTICE, useAutosave, type Opened, type SaveState } from '../editor/autosave'
import { NEAR_LIMIT, TOO_LARGE, TOO_MANY, useCollab } from '../editor/collab'
import Editor, { useKfEditor } from '../editor/Editor'
import { userColor } from '../editor/userColor'
import { extractText } from '../editor/extractText'
import SaveIndicator, { ReadOnlyTag, SaveNotice } from '../editor/SaveIndicator'
import { useEndSessionOnLeave } from '../editor/session'
import DiffView from '../history/DiffView'
import HistoryPanel, { type Viewing } from '../history/HistoryPanel'
import VersionBar from '../history/VersionBar'
import { readPref, savePref } from '../team/detailsPref'
import Icon from '../ui/Icon'
import { ActionButton, ActionLink, ScreenMessage } from '../ui/States'
import Time from '../ui/timeAgo'
import { toast } from '../ui/Toast'
import Breadcrumbs from './Breadcrumbs'
import s from './Page.module.css'
import PageMenu, { useUnarchive } from './PageMenu'
import Presence from './Presence'
import { trashBlocked, useTrashPage } from './useTrashPage'
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
  // QA-58: the page whose title the user typed in. Until then the field only mirrors the server and never saves: it starts
  // empty and gets the title one effect later, which made an empty title look like an edit on a page opened from the cache.
  const [typedIn, setTypedIn] = useState<string | null>(null)
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
  // an editor whose live session allows reading only right now (access dropped to VIEW, page restored, access gone)
  const [liveReadOnly, setLiveReadOnly] = useState(false)
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
  // The sidebar row's menu blocks Archive / Trash like this page's own menu does while the page is not saved yet.
  const unsaved = saveState !== 'saved' && saveState !== 'recovered'
  useEffect(() => {
    qc.setQueryData(['unsaved', nodeId], unsaved)
    return () => { qc.setQueryData(['unsaved', nodeId], false) }
  }, [qc, nodeId, unsaved])

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
      // QA-26: say who can now read it, and offer the way back.
      const team = qc.getQueryData<MySpace[]>(['spaces'])?.find((x) => x.id === updated.spaceId)?.teamName
      toast(team ? `Published to ${team}` : 'Published', 'info', {
        action: {
          label: 'Undo',
          run: () => void unpublishNode(updated.id)
            .then((back) => {
              qc.setQueryData(['node', back.id], back)
              return qc.invalidateQueries({ queryKey: ['tree', back.spaceId] })
            })
            .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not undo the publish.', 'error')),
        },
      })
      await Promise.all([qc.invalidateQueries({ queryKey: ['tree', updated.spaceId] }), qc.invalidateQueries({ queryKey: ['versions', nodeId] })])
    },
  })

  // The field follows the server's title, but never drops what is being typed (a save answering mid-word).
  const synced = useRef({ id: '', title: '' })
  // QA-65: a title is only sent for a page whose server title reached the field in this mount, and "" only when the user
  // emptied the field in this mount (a remount mid-edit, e.g. a dev hot reload, once saved "" over a real title).
  const loaded = useRef(new Set<string>())
  const cleared = useRef(new Set<string>())
  // Layout effect: the field must never paint (or be seen by a test) empty before the server title arrives in it.
  useLayoutEffect(() => {
    const server = node.data?.title ?? ''
    const prev = synced.current
    setTitle((t) => (prev.id !== nodeId || t === prev.title ? server : t))
    synced.current = { id: nodeId, title: server }
    if (node.data?.id === nodeId) loaded.current.add(nodeId)
  }, [node.data?.title, node.data?.id, nodeId])

  // QA-16: a page just made with New page opens with the caret in its title.
  const isNew = (useLocation().state as { isNew?: boolean } | null)?.isNew === true
  const titleReady = node.data?.id === nodeId && canEditNode
  useEffect(() => {
    if (isNew && titleReady) titleBox.current?.focus()
  }, [isNew, titleReady, nodeId])

  // QA-11: the title saves like the content: ~1 s after typing stops, at once on blur/Enter, and when the page is left.
  const titleDirty = typedIn === nodeId && node.data?.access === 'EDIT' && title.trim() !== node.data.title
  const titleSaving = titleDirty || rename.isPending
  const mutateTitle = rename.mutate
  const saveTitle = useCallback((v: { id: string; title: string }) => {
    if (!loaded.current.has(v.id) || (!v.title.trim() && !cleared.current.has(v.id))) return
    mutateTitle(v)
  }, [mutateTitle])
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
    if (gone && trashed.data) return <TrashedPage nodeId={nodeId} t={trashed.data} space={spaces.data?.find((x) => x.id === trashed.data.spaceId)} />
    const code = node.error instanceof ApiError ? node.error.status : 0
    return (
      <div className={s.state}>
        <p role="alert">{code === 404 ? 'This page does not exist.' : code === 403 ? "You don’t have access to this page." : 'Could not load this page.'}</p>
        {code !== 404 && code !== 403 && <p><button type="button" className={s.link} onClick={() => void node.refetch()}>Try again</button></p>}
      </div>
    )
  }
  const n = node.data
  const canEdit = n.access === 'EDIT'
  const editing = canEdit && n.status === 'ACTIVE'
  const space = spaces.data?.find((x) => x.id === n.spaceId)
  const readingOnly = liveReadOnly
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
          colour={n.color ?? 'gray'}
        />
        <span className={s.actions}>
          <span ref={setHead} />
          {readingOnly && canEdit && <ReadOnlyTag />}
          {n.access === 'VIEW' && n.status === 'ACTIVE' && !n.locked && <ReadOnlyTag label="View only" />}
          {n.access !== 'TITLE_ONLY' && (
            <button type="button" className={s.iconBtn} aria-label="Version history" title="Version history" aria-pressed={detailsOpen && panel === 'history'} onClick={toggleHistory}>
              <Icon name="history" />
            </button>
          )}
          {n.canManage && n.status === 'ACTIVE' && (
            <TrashButton node={n} blocked={trashBlocked(n, saveState !== 'saved' && saveState !== 'recovered')} />
          )}
          {editing && changes && !readingOnly && !viewing && (
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
        <div className={s.iconTile} data-page-icon style={{ '--c': dotColour(node.data?.color) } as React.CSSProperties} aria-hidden="true"><Icon name="doc-lines" size={26} /></div>
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
          onChange={(e) => {
            const v = e.target.value.replace(/\s*\n\s*/g, ' ')
            if (v.trim()) cleared.current.delete(n.id)
            else cleared.current.add(n.id)
            setTypedIn(n.id)
            setTitle(v)
          }}
          onBlur={() => titleDirty && saveTitle({ id: n.id, title })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        />
        {rename.error && <p role="alert" className={s.error}>{rename.error.message}</p>}
        {n.status === 'ARCHIVED' && <ArchivedNote node={n} />}
        {n.access === 'TITLE_ONLY' ? (
          <p className={s.note}>You can see this page’s title but not its content.</p>
        ) : (
          <>
            {/* QA-22: the properties are the current page's, not the version's */}
            {!viewing && <Properties node={n} canEdit={canEdit} changes={changes} canCompare={editing && !!lastPublished} onCompare={() => void compare()} />}
            {viewing && <DiffView state={viewing.state} previousState={viewing.previousState} authors={viewing.version.authors} />}
            {me.data ? (
              /* hidden, not unmounted: the editor keeps saving what was typed */
              <div hidden={!!viewing}>
                <PageContent
                  key={`${n.id}:${contentKey}`} node={n} userId={me.data.id} userName={me.data.fullName ?? ''} slots={{ head, banners }}
                  onSaveState={setSaveState} onReadOnly={setLiveReadOnly} stateRef={currentState} titleSaving={titleSaving}
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

/** QA-64: the visible way to delete a page; the same flow as the menu's Move to trash. */
function TrashButton({ node, blocked }: { node: NodeDetail; blocked?: string }) {
  const trash = useTrashPage(node)
  return (
    <button type="button" className={`${s.iconBtn} ${s.wideOnly}`} aria-label="Move to trash" title={blocked ?? 'Move to trash'} disabled={!!blocked}
      onClick={() => void trash().catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not move the page to the trash.', 'error'))}>
      <Icon name="trash" />
    </button>
  )
}

/** QA-33: what a trashed page (or a sub-page of a trashed page) shows instead of "does not exist". */
function TrashedPage({ nodeId, t, space }: { nodeId: string; t: Trashed; space?: MySpace }) {
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
  const name = t.title || 'Untitled'
  return (
    <>
    {/* QA-60: say which page, and where it lived */}
    <TopBar>
      <Breadcrumbs team={space?.teamId && space.teamName ? { id: space.teamId, name: space.teamName } : null} spaceName={space?.name} crumbs={[]} current={name} />
    </TopBar>
    <ScreenMessage
      title={`“${name}” is in the trash`}
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
      {what} moved to the trash{t.by ? ` by ${t.by.name}` : ''}{t.at && <> <Time iso={t.at} /></>}. {t.canRestore ? 'Restore it to read and edit it again.' : 'Ask an editor to restore it.'}
    </ScreenMessage>
    </>
  )
}

/** Loads the content (server copy + this user's unconfirmed local copies), then shows the editor. */
/** QA-35: the one archived message, with Unarchive right there for people who can. */
function ArchivedNote({ node }: { node: NodeDetail }) {
  const unarchive = useUnarchive(node)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const notice = await unarchive()
      if (notice) toast(notice)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not unarchive the page.', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <p className={s.note} role="status">
      This page is archived and read-only.{' '}
      {node.canManage && <button type="button" className={s.link} disabled={busy} onClick={() => void run()}>Unarchive</button>}
    </p>
  )
}

function PageContent({ node, userId, userName, slots, onSaveState, onReadOnly, stateRef, titleSaving }: {
  node: NodeDetail
  userId: string
  userName: string
  slots: Slots
  titleSaving: boolean
  onSaveState: (s: SaveState) => void
  onReadOnly: (readOnly: boolean) => void
  stateRef: MutableRefObject<() => string>
}) {
  const canEdit = node.access === 'EDIT'
  const [opened, setOpened] = useState<Opened>()
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [notice, setNotice] = useState('')
  // Edits that can never be saved are on screen: the content must not load again over them (access changing to VIEW).
  const holding = useRef(false)

  useEffect(() => {
    if (holding.current) return
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
  // QA-53: a load that failed offline tries again by itself once the connection is back.
  useEffect(() => {
    if (!failed) return
    const retry = () => setReloads((r) => r + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed])

  if (failed) {
    return (
      <p role="alert" className={s.error}>
        Could not load this page’s content. <button type="button" className={s.link} onClick={() => setReloads((r) => r + 1)}>Try again</button>
      </p>
    )
  }
  return (
    <>
      {notice && slots.banners && createPortal(<SaveNotice onDismiss={() => setNotice('')}>{notice}</SaveNotice>, slots.banners)}
      {opened ? (
        <PageEditor
          node={node}
          user={{ id: userId, name: userName }}
          opened={opened}
          slots={slots}
          onSaveState={onSaveState}
          onReadOnly={onReadOnly}
          stateRef={stateRef}
          titleSaving={titleSaving}
          onReload={() => setReloads((r) => r + 1)}
          onLost={() => (holding.current = true)}
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

function PageEditor({ node, user, opened, slots, onRecovered, onReload, onLost, onSaveState, onReadOnly, stateRef, titleSaving }: {
  node: NodeDetail
  user: { id: string; name: string }
  opened: Opened
  slots: Slots
  titleSaving: boolean
  onRecovered: () => void
  /** Opens the content again from the server. */
  onReload: () => void
  /** Unsaved edits that can never be stored stay on screen. */
  onLost: () => void
  onSaveState: (s: SaveState) => void
  onReadOnly: (readOnly: boolean) => void
  stateRef: MutableRefObject<() => string>
}) {
  const canEdit = node.access === 'EDIT'
  // a copy from before a restore never joins the live page: it is kept privately, then the page reloads
  const collab = useCollab(node.id, opened.ydoc, user.id, !opened.recover, opened.epoch)
  const editable = canEdit && collab.access !== 'VIEW' && !collab.problem
  // unsaved edits that can never be stored (edit rights gone): keep the copy logic alive for the leave prompt
  const [lost, setLost] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const qc = useQueryClient()
  const files = useMemo(
    () => ({ nodeId: node.id, onError: setUploadError, onUploaded: () => void qc.invalidateQueries({ queryKey: ['files', node.id] }) }),
    [node.id, qc],
  )
  const me = useMemo(() => ({ name: user.name || 'Someone', color: userColor(user.id) }), [user.id, user.name])
  const editor = useKfEditor(opened.ydoc, me, editable, files, collab.provider)
  useEndSessionOnLeave(node.id, canEdit)
  const save = useAutosave(node.id, opened, () => extractText(editor.document), canEdit || lost, collab.provider)
  const live = collab.problem === 'too-large' ? TOO_LARGE : collab.problem === 'too-many' ? TOO_MANY : collab.problem === 'gone' ? collab.message ?? undefined : collab.nearLimit ? NEAR_LIMIT : undefined
  const saveProblem = save.state === 'failed' ? (save.message === LOST_NOTICE ? LOST_NOTICE : `Not saved: ${save.message}`)
    : save.state === 'retrying' || save.state === 'offline' ? save.message : undefined

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
    onReadOnly(canEdit && !editable)
    return () => onReadOnly(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, editable])

  // Edit rights gone (removed, trashed, dropped to VIEW): unconfirmed edits can never be stored.
  const rightsGone = collab.problem === 'gone' || collab.access === 'VIEW'
  useEffect(() => {
    if (rightsGone && !save.lost()) {
      setLost(true)
      onLost()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightsGone])

  // Restored while open (D6): unconfirmed edits become a private version first ('recovered' below), else reload now.
  useEffect(() => {
    if (collab.problem === 'restored' && save.restored()) onReload()
    // No access any more (removed, trashed, ...): the page itself says why once it is fetched again.
    if (collab.problem === 'gone') void qc.invalidateQueries({ queryKey: ['node', node.id] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab.problem])

  useEffect(() => {
    if (save.state === 'recovered') onRecovered()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.state])

  return (
    <>
      {(editable || save.state === 'failed') && slots.head && createPortal(<SaveIndicator state={titleSaving && save.state === 'saved' ? 'saving' : save.state} local={save.local} />, slots.head)}
      {collab.provider?.awareness && slots.head && createPortal(<Presence awareness={collab.provider.awareness} selfId={user.id} />, slots.head)}
      {uploadError && slots.banners && createPortal(<SaveNotice onDismiss={() => setUploadError('')}>{uploadError}</SaveNotice>, slots.banners)}
      {live && slots.banners && createPortal(<SaveNotice>{live}</SaveNotice>, slots.banners)}
      {saveProblem && slots.banners && createPortal(<SaveNotice>{saveProblem}</SaveNotice>, slots.banners)}
      {!canEdit && node.status !== 'ARCHIVED' && <p className={s.note}>{node.locked ? 'This page is locked.' : 'You can read this page but not edit it.'}</p>}
      <Editor editor={editor} editable={editable} />
    </>
  )
}
