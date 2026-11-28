import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import BoardCanvas from './BoardCanvas'
import type { El } from './binding/sync'
import { createUndo } from './binding/undo'
import { ELEMENTS } from './format'

// Excalidraw itself needs a real canvas: a stand-in keeps its props and a fake API.
type Props = { onChange: (els: readonly El[], appState: Record<string, unknown>) => void; excalidrawAPI: (api: unknown) => void }
const ex = vi.hoisted(() => ({ props: null as unknown as Props, updateScene: vi.fn(), restore: vi.fn((els: unknown) => els) }))
vi.mock('./assetPath', () => ({}))
vi.mock('@excalidraw/excalidraw/index.css', () => ({}))
vi.mock('@excalidraw/excalidraw', () => {
  const Menu = ({ children }: { children?: ReactNode }) => <>{children}</>
  const none = () => null
  return {
    Excalidraw: (p: Props & { children?: ReactNode }) => {
      ex.props = p
      p.excalidrawAPI({ updateScene: ex.updateScene, getAppState: () => ({ scrollX: 0, scrollY: 0, width: 800, height: 600, zoom: { value: 1 } }) })
      return <div><canvas /></div>
    },
    MainMenu: Object.assign(Menu, { DefaultItems: { SaveAsImage: none, Export: none, Help: none, ChangeCanvasBackground: none } }),
    CaptureUpdateAction: { NEVER: 'NEVER' },
    restoreElements: (els: unknown) => ex.restore(els),
    viewportCoordsToSceneCoords: () => ({ x: 7, y: 8 }),
  }
})

const el = (version: number, x: number): El => ({ id: 'x', type: 'rectangle', version, versionNonce: version, isDeleted: false, index: 'a0', updated: 1, x })
const idle = { newElement: null, editingTextElement: null, selectedElementsAreBeingDragged: false, resizingElement: null, isRotating: false, multiElement: null }

afterEach(() => {
  cleanup()
  ex.updateScene.mockReset()
  ex.restore.mockReset()
  ex.restore.mockImplementation((els: unknown) => els)
})

it('remoteChangeWaitsForMyDrag', () => { // WB 7.2: never overwrite what this user is moving right now
  const doc = new Y.Doc()
  doc.getMap<El>(ELEMENTS).set('x', el(1, 0))
  render(<BoardCanvas doc={doc} editable name="Plan" undo={createUndo(doc)} onLive={() => {}} />)

  ex.props.onChange([el(2, 10)], { ...idle, selectedElementsAreBeingDragged: true })
  const remote = new Y.Doc()
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
  remote.getMap<El>(ELEMENTS).set('x', el(5, 500))
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote')
  expect(ex.updateScene).not.toHaveBeenCalled()

  ex.props.onChange([el(3, 20)], idle) // drop: the newer remote value applies now
  expect(ex.updateScene).toHaveBeenCalledTimes(1)
  expect((ex.updateScene.mock.calls[0][0] as { elements: El[] }).elements[0].x).toBe(500)
})

// Two people add a shape at once: both get the same layer index. Excalidraw's restore re-indexes one locally and bumps
// its version; only collab writes index fixes (WB 7.1), so that local repair must never go out or become an undo step.
it('localIndexRepairIsNeverSent', () => {
  const doc = new Y.Doc()
  const undo = createUndo(doc)
  render(<BoardCanvas doc={doc} editable name="Plan" undo={undo} onLive={() => {}} />)
  ex.restore.mockImplementation((els) => (els as El[]).map((e) => (e.id === 'y' ? { ...e, index: 'a1', version: e.version + 1 } : e)))

  const remote = new Y.Doc()
  remote.getMap<El>(ELEMENTS).set('x', el(1, 0))
  remote.getMap<El>(ELEMENTS).set('y', { ...el(1, 0), id: 'y' })
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote')
  const shown = (ex.updateScene.mock.calls.at(-1)![0] as { elements: El[] }).elements
  expect(shown.find((e) => e.id === 'y')!.version).toBe(2)

  ex.props.onChange(shown, { ...idle, newElement: { id: 'z', type: 'rectangle' } }) // Excalidraw reports what it shows
  ex.props.onChange(shown, idle) // a gesture ends: everything new goes out now
  expect(doc.getMap<El>(ELEMENTS).get('y')!.version).toBe(1)
  expect(undo.canUndo()).toBe(false)
})

it('viewerLaserIsSent', () => { // WB 7.5: viewers may use the laser
  const doc = new Y.Doc()
  const awareness = new Awareness(doc)
  awareness.setLocalState({ user: { id: 'v', name: 'V', color: '' } })
  const { container } = render(<BoardCanvas doc={doc} editable={false} name="Plan" undo={createUndo(doc)} onLive={() => {}} awareness={awareness} />)

  fireEvent.click(screen.getByRole('button', { name: 'Laser pointer' }))
  fireEvent.pointerDown(container.querySelector('canvas')!)
  expect(awareness.getLocalState()).toMatchObject({ pointer: { x: 7, y: 8, tool: 'laser' }, button: 'down' })
  awareness.destroy()
})
