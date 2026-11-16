import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { blocksToYDoc } from '@blocknote/core/yjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { VersionSummary } from '../api/versions'
import { toBase64 } from '../editor/base64'
import { FRAGMENT, kfSchema } from '../editor/schema'
import { useEndSessionOnLeave } from '../editor/session'
import DiffView from './DiffView'
import HistoryPanel, { type Viewing } from './HistoryPanel'
import { groupVersions } from './groupVersions'

// jsdom has no matchMedia (Mantine) or layout (BlockNote's side menu).
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
document.elementsFromPoint ??= () => []

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const NOW = new Date(2026, 10, 12, 15, 0) // Thu 12 Nov 2026, 15:00 local
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString()
const sayem = { id: 'u1', name: 'Sayem', avatarUrl: null }
const rafi = { id: 'u2', name: 'Rafi', avatarUrl: null }

function v(id: string, kind: VersionSummary['kind'], createdAt: string, extra: Partial<VersionSummary> = {}): VersionSummary {
  return { id, kind, name: null, authors: [sayem], createdAt, updatedAt: createdAt, private: false, ...extra }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderPanel(versions: VersionSummary[], canEdit: boolean, onView = vi.fn(), viewing: Viewing | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input)
    if (u === '/api/nodes/n1/versions') return json(versions)
    const m = u.match(/^\/api\/versions\/(\w+)$/)
    if (m) return json({ ...versions.find((x) => x.id === m[1]), state: 'state of ' + m[1], text: 'text of ' + m[1] })
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const onRestore = vi.fn()
  render(
    <HistoryPanel nodeId="n1" canEdit={canEdit} viewing={viewing} onView={onView} getCurrentState={() => 'current state'} restoring={false} restoreError="" onRestore={onRestore} onClose={() => {}} now={NOW} />,
    { wrapper: wrap },
  )
  return { onView, onRestore, fetchMock }
}

describe('groupVersions', () => {
  it('groupsByDayAndSession', () => {
    const groups = groupVersions(
      [
        v('a3', 'AUTO', at(12, 14, 15)),
        v('a2', 'AUTO', at(12, 14, 0)), // 15 min before: same session
        v('n1', 'NAMED', at(12, 11, 2), { name: 'Draft' }),
        v('a1', 'AUTO', at(11, 21, 0)),
        v('old', 'AUTO', at(2, 9, 0)),
      ],
      NOW,
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Nov 2'])
    const today = groups[0].items
    expect(today[0]).toMatchObject({ kind: 'session' })
    expect(today[0].kind === 'session' && today[0].versions.map((x) => x.id)).toEqual(['a3', 'a2'])
    expect(today[1]).toMatchObject({ kind: 'version' })
  })

  it('recoveredShownAsPrivateDraft', async () => {
    const list = [
      v('p1', 'RECOVERED', at(12, 10), { private: true }),
      v('p2', 'AUTO', at(12, 9), { private: true }),
      v('a1', 'AUTO', at(12, 8)),
    ]
    const g = groupVersions(list, NOW)[0].items
    const last = g.at(-1)
    expect(last).toMatchObject({ kind: 'private' })
    expect(last?.kind === 'private' && last.versions).toHaveLength(2)

    renderPanel(list, true)
    expect(await screen.findByText('2 private drafts · Only you can see these')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /2 private drafts/ }))
    expect(screen.getByText('Recovered unsaved changes')).toBeTruthy()
  })
})

describe('history panel', () => {
  const list = [v('n1', 'NAMED', at(12, 11), { name: 'Before submission' }), v('a1', 'AUTO', at(12, 9))]
  const viewing = (id: string, extra: Partial<Viewing> = {}): Viewing => ({
    version: list.find((x) => x.id === id)!, number: 1, previousNumber: null, state: 'old', previousState: '', canRestore: true, against: 'previous', ...extra,
  })

  it('showsAuthorKindTimeAndACurrentPillOnTheNewestOnly', async () => {
    renderPanel(list, true)
    expect(await screen.findByText('Before submission')).toBeTruthy() // a named version shows its name as the kind
    expect(screen.getByText('Autosaved')).toBeTruthy()
    expect(screen.getAllByText('Current')).toHaveLength(1)
    expect(screen.getByText('11:00 am')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Authors' }).textContent).toContain('Sayem')
  })

  it('namedOnlyFilter', async () => {
    renderPanel(list, true)
    expect(await screen.findByText('Autosaved')).toBeTruthy()
    await userEvent.click(screen.getByLabelText('Named versions only'))
    expect(screen.getByText('Before submission')).toBeTruthy()
    expect(screen.queryByText('Autosaved')).toBeNull()
  })

  it('selectingShowsTheVersionAgainstTheOneBefore', async () => {
    const { onView } = renderPanel(list, true)
    await userEvent.click(await screen.findByText('Before submission'))
    await waitFor(() => expect(onView).toHaveBeenCalled())
    expect(onView.mock.calls[0][0]).toMatchObject({ version: { id: 'n1' }, number: 2, previousNumber: 1, state: 'state of n1', previousState: 'state of a1', against: 'previous' })
  })

  it('restoreHiddenForViewers', async () => {
    const { onView } = renderPanel(list, false)
    await userEvent.click(await screen.findByText('Before submission'))
    await waitFor(() => expect(onView).toHaveBeenCalled())
    expect(onView.mock.calls[0][0].canRestore).toBe(false)
    expect(screen.queryByRole('button', { name: /Name the current version/ })).toBeNull()
  })

  it('footerOffersRestoreAndCompareForAnOlderVersionButNotRestoreForTheCurrentOne', async () => {
    const older = renderPanel(list, true, vi.fn(), viewing('a1'))
    await screen.findByText('Autosaved')
    await userEvent.click(screen.getByRole('button', { name: 'Restore this version' }))
    expect(older.onRestore).toHaveBeenCalledWith('a1')
    await userEvent.click(screen.getByRole('button', { name: 'Compare with current' }))
    await waitFor(() => expect(older.onView).toHaveBeenCalled())
    expect(older.onView.mock.calls[0][0]).toMatchObject({ against: 'current', state: 'current state', previousState: 'state of a1' })
    cleanup()
    renderPanel(list, true, vi.fn(), viewing('n1', { number: 2 }))
    await screen.findByText('Before submission')
    expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull() // restoring the current one changes nothing
    expect(screen.getByRole('button', { name: 'Compare with current' })).toBeTruthy()
  })

  it('showsTwentyVersionsThenLoadsOlderOnRequest', async () => {
    const many = Array.from({ length: 25 }, (_, i) => v(`m${i}`, 'NAMED', at(12, 8, i), { name: `Named ${i}` }))
    renderPanel(many, true)
    expect(await screen.findByText('Named 24')).toBeTruthy() // newest
    expect(screen.queryByText('Named 4')).toBeNull() // the 21st newest and older wait
    await userEvent.click(screen.getByRole('button', { name: 'Load older versions' }))
    expect(screen.getByText('Named 0')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load older versions' })).toBeNull()
  })
})

describe('DiffView', () => {
  // A saved page state (base64 Yjs update), as the server stores versions.
  const stateOf = (blocks: PartialBlock<typeof kfSchema.blockSchema, typeof kfSchema.inlineContentSchema, typeof kfSchema.styleSchema>[]) =>
    toBase64(Y.encodeStateAsUpdate(blocksToYDoc(BlockNoteEditor.create({ schema: kfSchema }), blocks, FRAGMENT)))
  const img = { id: 'img', type: 'image', props: { url: '/api/attachments/f1/download', name: 'bleu.png' } } as const
  const before = stateOf([
    { id: 'p1', type: 'paragraph', content: 'Collect 100 students' },
    img,
    { id: 'p2', type: 'paragraph', content: 'An old line' },
  ])
  const after = stateOf([
    { id: 'p1', type: 'paragraph', content: 'Collect 120 students' },
    { id: 'h1', type: 'heading', props: { level: 2 }, content: 'Key ideas' },
    img,
  ])
  const outer = (c: HTMLElement, id: string) => c.querySelector(`[data-node-type="blockOuter"][data-id="${id}"]`)

  it('diffMarksInsertAndDelete', async () => {
    // QA-21: the version used to be flattened to plain text; headings, images and files were lost
    const { container } = render(<DiffView state={after} previousState={before} authors={[rafi]} />)
    await waitFor(() => expect(container.querySelector('.bn-editor')).toBeTruthy())
    expect(container.querySelector('.bn-editor')!.getAttribute('contenteditable')).toBe('false')
    expect(container.querySelector('[data-content-type="heading"]')!.textContent).toBe('Key ideas')
    expect(container.querySelector('[data-content-type="image"]')).toBeTruthy()
    expect(container.querySelector('[data-value="kf-ins"]')!.textContent).toBe('120')
    expect(container.querySelector('[data-value="kf-del"]')!.textContent).toBe('100')
    await waitFor(() => expect(outer(container, 'h1')!.getAttribute('data-diff')).toBe('added'))
    expect(outer(container, 'p2')!.getAttribute('data-diff')).toBe('removed') // still shown where it was, struck through
    expect(outer(container, 'p2')!.textContent).toBe('An old line')
    expect(outer(container, 'img')!.getAttribute('data-diff')).toBeNull()
    expect(screen.getByText("Rafi's changes")).toBeTruthy()
  })

  it('manyAuthorsShareOneColourAndAllNamesAreListed', () => {
    render(<DiffView state={after} previousState="" authors={[rafi, sayem]} />)
    expect(screen.getByText("Rafi, Sayem's changes")).toBeTruthy()
  })
})

describe('leaving the page', () => {
  it('leavingPageEndsSession', () => {
    const fetchMock = vi.fn(async () => json(null, 204))
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderHook(() => useEndSessionOnLeave('n9', true))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent(window, new Event('pagehide'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/nodes/n9/session/end')
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
    unmount() // route change inside the app
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('viewersDoNotEndSessions', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderHook(() => useEndSessionOnLeave('n9', false))
    fireEvent(window, new Event('pagehide'))
    unmount()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

