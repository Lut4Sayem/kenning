import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type * as Y from 'yjs'
import type { BoardUndo } from './binding/undo'
import { LOCAL } from './binding/undo'
import BoardView from './BoardView'
import { ELEMENTS } from './format'

const canvas = vi.hoisted(() => ({ doc: null as Y.Doc | null, undo: null as BoardUndo | null }))
vi.mock('./BoardCanvas', () => ({
  default: (p: { doc: Y.Doc; undo: BoardUndo }) => {
    canvas.doc = p.doc
    canvas.undo = p.undo
    return <p>canvas</p>
  },
}))
vi.mock('../api/nodes', () => ({
  getNode: async () => ({
    id: 'b1', spaceId: 's1', parentId: null, title: 'Plan', icon: null, tags: [], type: 'BOARD', publishState: 'PUBLISHED', locked: false,
    lockedBy: null, status: 'ACTIVE', access: 'VIEW', canManage: false, breadcrumbs: [], createdBy: null, updatedBy: null, contentUpdatedAt: '',
  }),
}))
vi.mock('../api/content', () => ({ getContent: async () => ({ format: 'YJS_BOARD_V1', state: '', revision: 0, contentEpoch: 0 }) }))
vi.mock('../api/spaces', () => ({ getMe: async () => ({ id: 'u1', fullName: 'Ann', email: 'a@x.test' }), getMySpaces: async () => [] }))
vi.mock('../editor/collab', () => ({
  TOO_MANY: 'busy',
  useCollab: () => ({ provider: null, access: 'VIEW', problem: null, message: null, nearLimit: false }),
}))

afterEach(cleanup)

it('undoSurvivesStrictModeRemount', async () => { // dev runs effects twice: the history must still record
  render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/b/b1']}>
          <Routes><Route path="/b/:nodeId" element={<BoardView />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
  await screen.findByText('canvas')
  await waitFor(() => expect(canvas.undo).not.toBeNull())
  canvas.doc!.transact(() => canvas.doc!.getMap(ELEMENTS).set('x', { id: 'x', version: 1, versionNonce: 1 }), LOCAL)
  expect(canvas.undo!.canUndo()).toBe(true)
})
