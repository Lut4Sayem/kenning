// Excalidraw on a board's Y.Doc. Only this module (and what it imports) pulls in Excalidraw; it is loaded lazily.
import './assetPath' // before Excalidraw: it reads the asset path once
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, MainMenu, restoreElements, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { ELEMENTS } from './format'
import { loadBundledLibraries } from './libraries'
import { centerOn, type BoardElements } from './mermaid'
import MermaidDialog from './MermaidDialog'
import { bindUndoKeys } from './binding/keys'
import { WRITE_BACK, createThrottle, pushLocal, sceneFromDoc, writeBackLosers, type El } from './binding/sync'
import type { BoardUndo } from './binding/undo'
import { createSender, toCollaborators, type BoardAwareness } from './presence'
import { loadMode, saveMode, styleDefaults, type StyleMode } from './style'
import { loadTheme, saveTheme } from './theme'
import Toolbar from './Toolbar'
import s from './Board.module.css'

interface Props {
  doc: Y.Doc
  editable: boolean
  name: string
  undo: BoardUndo
  /** The sorted types of the live (non-deleted) elements, whenever they change. */
  onLive: (types: string) => void
  awareness?: Awareness | null
  /** Excalidraw's API once it is ready (follow and zoom to fit use it). */
  onApi?: (api: ExcalidrawImperativeAPI) => void
}

type Scene = Parameters<ExcalidrawImperativeAPI['updateScene']>[0]['elements']

const liveTypes = (els: readonly { type: string; isDeleted: boolean }[]) =>
  els.filter((e) => !e.isDeleted).map((e) => e.type).sort().join(',')

/** A drag, resize, rotate, pen stroke, line being drawn or text being typed: one undo step, ended when it ends. */
const inGesture = (a: AppState) =>
  !!(a.newElement || a.editingTextElement || a.selectedElementsAreBeingDragged || a.resizingElement || a.isRotating || a.multiElement)

export default function BoardCanvas({ doc, editable, name, undo, onLive, awareness, onApi }: Props) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const known = useRef(new Map<string, number>()) // highest version this tab wrote or saw, per element
  const latest = useRef<readonly El[]>([]) // what Excalidraw shows now
  const now = useRef({ editingId: null as string | null, freedraw: false, gesture: false, typing: false })
  const held = useRef(new Set<string>()) // remote changes waiting for this user's drag/resize/stroke to end
  const canWrite = useRef(editable)
  canWrite.current = editable
  const pushing = useRef(false)
  const throttle = useMemo(() => createThrottle(100), [])
  const live = useRef(onLive)
  live.current = onLive

  /**
   * Excalidraw's restore repairs some things locally (an index two people took at once, a dangling binding) and bumps
   * the version as it does. Only collab writes such fixes (WB 7.1): the bumped versions count as already sent.
   */
  function restore(els: readonly El[]) {
    const restored = restoreElements(els as unknown as Scene, null, { repairBindings: true })
    for (const e of restored) known.current.set(e.id, Math.max(known.current.get(e.id) ?? -1, e.version))
    return restored
  }

  const sender = useMemo(() => (awareness ? createSender(awareness) : null), [awareness])
  const loaded = useRef(false)
  // Excalidraw's view mode only pans, so a viewer's laser (WB 7.5) is ours: its pointer events never reach the canvas.
  const [laserOn, setLaserOn] = useState(false)
  const laser = laserOn && !editable
  const myLaser = useRef<{ pointer: NonNullable<BoardAwareness['pointer']>; button: 'up' | 'down' } | null>(null)

  /** Others' cursors, selections and laser trails, plus the trail of this viewer's own laser. */
  function showPeople() {
    if (!awareness || !api.current) return
    const states = awareness.getStates() as Map<number, BoardAwareness & { kf?: { viewer?: boolean } }>
    const viewers = new Set([...states].filter(([, v]) => v.kf?.viewer).map(([id]) => id))
    const collaborators = toCollaborators(states, awareness.clientID, viewers)
    const mine = myLaser.current
    const me = states.get(awareness.clientID)?.user
    if (mine && me) {
      const self = toCollaborators(new Map([[awareness.clientID, { user: me, ...mine }]]), -1, new Set())
      for (const [id, v] of self) collaborators.set(id, { ...v, pointer: v.pointer && { ...v.pointer, renderCursor: false } })
    }
    api.current.updateScene({ collaborators })
    // the canvas has no DOM: the names of the cursors drawn, for tests (like data-live)
    if (box.current) box.current.dataset.cursors = [...collaborators.values()].filter((c) => c.pointer?.renderCursor).map((c) => c.username).sort().join(',')
  }

  function sendViewport(a: AppState) {
    sender?.viewport({ x: -a.scrollX, y: -a.scrollY, width: a.width / a.zoom.value, height: a.height / a.zoom.value, zoom: a.zoom.value })
  }

  useEffect(() => {
    if (!awareness) return
    const onChange = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if ([...added, ...updated, ...removed].some((id) => id !== awareness.clientID)) showPeople()
    }
    awareness.on('change', onChange)
    showPeople()
    const a = api.current?.getAppState?.()
    if (a) sendViewport(a)
    return () => awareness.off('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showPeople and sendViewport read refs and these two
  }, [awareness, sender])

  function pointLaser(e: ReactPointerEvent, button: 'up' | 'down') {
    if (!laser || !api.current || !(e.target instanceof HTMLCanvasElement)) return
    e.stopPropagation()
    if (e.type === 'pointerdown') e.target.setPointerCapture?.(e.pointerId)
    const { x, y } = viewportCoordsToSceneCoords(e, api.current.getAppState())
    myLaser.current = { pointer: { x, y, tool: 'laser' }, button }
    sender?.pointer(myLaser.current.pointer, button)
    showPeople()
  }

  function toggleLaser() {
    if (laser) {
      myLaser.current = null
      sender?.pointer(undefined, 'up')
      showPeople()
    }
    setLaserOn(!laser)
  }

  const [tool, setTool] = useState('selection')
  const [mode, setMode] = useState(loadMode)
  const [theme, setTheme] = useState(loadTheme)

  function pickMode(next: StyleMode) {
    setMode(next)
    saveMode(next)
    api.current?.updateScene({ appState: styleDefaults(next), captureUpdate: CaptureUpdateAction.NEVER })
  }

  /** A yellow square in the middle of the view, selected, so Enter types into it. */
  function addSticky() {
    const a = api.current
    if (!a) return
    const view = a.getAppState()
    const { x, y } = viewportCoordsToSceneCoords({ clientX: view.offsetLeft + view.width / 2, clientY: view.offsetTop + view.height / 2 }, view)
    const [note] = convertToExcalidrawElements([{
      type: 'rectangle', x: x - 80, y: y - 80, width: 160, height: 160,
      backgroundColor: '#ffec99', fillStyle: 'solid', strokeColor: 'transparent',
    }])
    undo.stopCapturing() // its own undo step
    a.setActiveTool({ type: 'selection' })
    a.updateScene({ elements: [...a.getSceneElementsIncludingDeleted(), note], appState: { selectedElementIds: { [note.id]: true } } })
  }

  const [mermaidOpen, setMermaidOpen] = useState(false)

  /** A Mermaid diagram's shapes in the middle of the view, selected, as one undo step. */
  function insertShapes(els: BoardElements) {
    const a = api.current
    if (!a) return
    const view = a.getAppState()
    const { x, y } = viewportCoordsToSceneCoords({ clientX: view.offsetLeft + view.width / 2, clientY: view.offsetTop + view.height / 2 }, view)
    const placed = centerOn(els, x, y)
    undo.stopCapturing()
    a.setActiveTool({ type: 'selection' })
    a.updateScene({
      elements: [...a.getSceneElementsIncludingDeleted(), ...placed],
      appState: { selectedElementIds: Object.fromEntries(placed.map((e) => [e.id, true as const])) },
    })
  }

  const initial = useMemo(() => restore(sceneFromDoc(doc, [], null)), [doc])
  const libraryItems = useMemo(loadBundledLibraries, []) // Excalidraw reads initialData once, on mount
  useEffect(() => live.current(liveTypes(initial)), [initial]) // the loaded board, before any onChange

  function push() {
    if (!canWrite.current) return
    pushing.current = true
    try {
      pushLocal(doc, latest.current, known.current, { editingId: now.current.editingId, drawingFreedraw: now.current.freedraw })
    } finally {
      pushing.current = false
    }
  }

  /** Shows the map, keeping what this user is editing; where Yjs settled on an older copy of mine, mine goes back. */
  function showDoc(changed: Iterable<string>) {
    if (canWrite.current) {
      for (const id of writeBackLosers(doc, latest.current, changed)) {
        const mine = latest.current.find((e) => e.id === id)
        if (mine) known.current.set(id, Math.max(known.current.get(id) ?? -1, mine.version))
      }
    }
    const scene = sceneFromDoc(doc, latest.current, now.current.editingId)
    api.current?.updateScene({
      elements: restore(scene),
      captureUpdate: CaptureUpdateAction.NEVER, // others' changes never enter Excalidraw's history
    })
  }

  useEffect(() => {
    const map = doc.getMap<El>(ELEMENTS)
    const onMap = (e: Y.YMapEvent<El>) => {
      if (pushing.current || e.transaction.origin === WRITE_BACK) return // already on screen
      for (const id of e.keysChanged) {
        const v = map.get(id)
        if (v && v.version > (known.current.get(id) ?? -1)) known.current.set(id, v.version)
      }
      // Mid-drag (or resize, rotate, stroke) the shapes under the pointer must not jump: wait for the drop. While text is
      // typed, everything but that text updates live (sceneFromDoc keeps the text being edited).
      if (now.current.gesture && !now.current.typing) e.keysChanged.forEach((id) => held.current.add(id))
      else showDoc(e.keysChanged) // remote changes, and this user's undo/redo
    }
    map.observe(onMap)
    return () => map.unobserve(onMap)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showDoc reads refs only
  }, [doc])

  useEffect(() => (editable && box.current ? bindUndoKeys(box.current, undo) : undefined), [editable, undo])

  return (
    <div
      ref={box}
      className={s.canvas}
      data-laser={laser || undefined}
      onPointerDownCapture={(e) => pointLaser(e, 'down')}
      onPointerMoveCapture={(e) => pointLaser(e, e.buttons & 1 ? 'down' : 'up')}
      onPointerUpCapture={(e) => pointLaser(e, 'up')}
      onPointerCancelCapture={(e) => pointLaser(e, 'up')}
    >
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a
          onApi?.(a)
        }}
        initialData={{ elements: initial, appState: styleDefaults(mode), libraryItems }}
        isCollaborating
        aiEnabled={false} // also drops the command palette's entry for Excalidraw's own Mermaid dialog
        viewModeEnabled={!editable}
        name={name}
        theme={theme}
        UIOptions={{
          tools: { image: false },
          canvasActions: { loadScene: false, saveToActiveFile: false, saveAsImage: true, export: { saveFileToDisk: true }, toggleTheme: true },
        }}
        onPaste={(data) => !(data.files && Object.keys(data.files).length > 0)}
        onPointerUpdate={({ pointer, button }) => {
          if (canWrite.current) sender?.pointer({ x: pointer.x, y: pointer.y, tool: pointer.tool }, button) // viewers: laser only
        }}
        onChange={(elements, appState) => {
          setTool(appState.activeTool?.type ?? 'selection')
          if (sender) {
            sender.selection(appState.selectedElementIds as Record<string, true>)
            sendViewport(appState)
            // loading the scene empties Excalidraw's collaborators: show who is already here again
            if (!loaded.current) {
              loaded.current = true
              showPeople()
            }
          }
          latest.current = elements as unknown as El[]
          live.current(liveTypes(elements))
          const was = now.current
          now.current = {
            editingId: appState.editingTextElement?.id ?? appState.newElement?.id ?? null,
            freedraw: appState.newElement?.type === 'freedraw',
            gesture: inGesture(appState),
            typing: !!appState.editingTextElement,
          }
          if (was.gesture && !now.current.gesture) {
            push() // the gesture's last state goes out now (a pen stroke goes out only now)
            undo.stopCapturing()
            // what was held back applies now (or loses to this user's newer copy)
            const waiting = [...held.current, ...(was.editingId ? [was.editingId] : [])]
            held.current.clear()
            if (waiting.length > 0) showDoc(waiting)
          } else {
            throttle(push)
          }
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ToggleTheme onSelect={(t) => { setTheme(t); saveTheme(t) }} />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
      <Toolbar
        editable={editable}
        active={tool}
        mode={mode}
        onTool={(type) => api.current?.setActiveTool({ type })}
        onSticky={addSticky}
        onMode={pickMode}
        onMermaid={() => setMermaidOpen(true)}
        onFit={() => api.current?.scrollToContent(undefined, { fitToContent: true, animate: true })}
        onMousePick={() => box.current?.querySelector<HTMLElement>('.excalidraw')?.focus()}
      />
      {!editable && (
        <button type="button" className={s.laser} aria-pressed={laser} onClick={toggleLaser}>Laser pointer</button>
      )}
      {mermaidOpen && editable && <MermaidDialog onInsert={insertShapes} onClose={() => setMermaidOpen(false)} />}
    </div>
  )
}
