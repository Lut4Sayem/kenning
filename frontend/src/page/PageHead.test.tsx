import 'fake-indexeddb/auto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeDetail } from '../api/nodes'
import PageView from './PageView'

// jsdom has no matchMedia (Mantine) or layout (BlockNote's side menu).
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
document.elementsFromPoint ??= () => []

const nodesApi = vi.hoisted(() => ({ getNode: vi.fn(), updateNode: vi.fn(), publishNode: vi.fn() }))
vi.mock('../api/nodes', () => nodesApi)
const spacesApi = vi.hoisted(() => ({ getMe: vi.fn(), getMySpaces: vi.fn() }))
vi.mock('../api/spaces', () => spacesApi)
const contentApi = vi.hoisted(() => ({ getContent: vi.fn(), saveContent: vi.fn(), saveRecovered: vi.fn(), acquireEditLock: vi.fn(), releaseEditLock: vi.fn() }))
vi.mock('../api/content', () => contentApi)
const versionsApi = vi.hoisted(() => ({ listVersions: vi.fn(), getVersion: vi.fn(), restoreVersion: vi.fn(), nameVersion: vi.fn(), endSession: vi.fn() }))
vi.mock('../api/versions', () => versionsApi)
const extras = vi.hoisted(() => ({ getComments: vi.fn(), getAttachments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(), deleteAttachment: vi.fn(), summarize: vi.fn(), ask: vi.fn() }))
vi.mock('../api/pageExtras', () => extras)

const shell = vi.hoisted(() => ({ open: true, set: vi.fn() }))
// The shell's slots render in place so the tests can see them.
vi.mock('../app/ShellSlots', () => ({
  TopBar: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DetailsPanel: ({ children }: { children: React.ReactNode }) => <aside aria-label="Details">{children}</aside>,
  useShellSlots: () => ({ detailsOpen: shell.open, setDetailsOpen: shell.set }),
}))

const HOUR = 3600_000
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString()
const NODE: NodeDetail = {
  id: 'n1', spaceId: 's1', parentId: null, title: 'Use cases', icon: null, tags: ['srs'], publishState: 'DRAFT', locked: false,
  lockedBy: null, status: 'ACTIVE', access: 'EDIT', canManage: true, breadcrumbs: [{ id: 'p0', title: 'Specs' }],
  createdBy: { id: 'u2', name: 'Rafi Ahmed', avatarUrl: null }, updatedBy: { id: 'u2', name: 'Rafi Ahmed', avatarUrl: null }, contentUpdatedAt: ago(2),
}
const PUBLISHED_VERSION = { id: 'v1', kind: 'PUBLISHED', name: null, authors: [{ id: 'u2', name: 'Rafi Ahmed', avatarUrl: null }], createdAt: ago(3), updatedAt: ago(3), private: false }

beforeEach(() => {
  shell.open = true
  nodesApi.getNode.mockResolvedValue(NODE)
  spacesApi.getMe.mockResolvedValue({ id: 'u1', fullName: 'Me', email: 'm@x.test' })
  spacesApi.getMySpaces.mockResolvedValue([{ id: 's1', name: 'Requirements', icon: null, ownerType: 'TEAM', teamId: 't1', teamName: 'Thesis Group', myRole: 'ADMIN' }])
  contentApi.getContent.mockResolvedValue({ format: 'YJS_BLOCKNOTE_V1', state: '', revision: 0, contentEpoch: 0 })
  contentApi.acquireEditLock.mockResolvedValue({ mine: true, holder: { id: 'u1', name: 'Me' }, expiresAt: '' })
  contentApi.releaseEditLock.mockResolvedValue(null)
  versionsApi.listVersions.mockResolvedValue([])
  versionsApi.getVersion.mockResolvedValue({ ...PUBLISHED_VERSION, state: '', text: 'the published text' })
  extras.getComments.mockResolvedValue([])
  extras.getAttachments.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/p/n1']}>
        <Routes>
          <Route path="/p/:nodeId" element={<PageView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bar = () => within(screen.getByRole('banner'))

describe('page top bar and properties', () => {
  it('breadcrumbsListTeamSpaceParentsAndThePageWithItsDot', async () => {
    mount()
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(Array.from(crumbs.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Thesis Group', 'Requirements', 'Specs', 'Use cases'])
    expect(crumbs.querySelector('[aria-current="page"]')!.textContent).toBe('Use cases')
  })

  it('longTitlesWrapAndDeepBreadcrumbsCollapseTheMiddleNotTheTeamAndSpace', async () => {
    // QA-42: a 200-character title was cut mid-word in a one-line field and pushed the team and space out of the bar
    const long = 'A very long working title about attention mechanisms in neural machine translation '.repeat(2).trim()
    nodesApi.getNode.mockResolvedValue({ ...NODE, title: long, breadcrumbs: [{ id: 'p1', title: 'Reading list' }, { id: 'p2', title: 'Survey papers' }, { id: 'p3', title: 'Transformers' }] })
    mount()
    const field = await screen.findByLabelText('Page title')
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(long))
    expect(field.tagName).toBe('TEXTAREA') // wraps instead of scrolling sideways

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(Array.from(crumbs.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Thesis Group', 'Requirements', '…', 'Transformers', long])
    expect(within(crumbs).getByText('…').getAttribute('title')).toBe('Reading list / Survey papers')
    expect(crumbs.querySelector('[aria-current="page"] [title]')!.getAttribute('title')).toBe(long)
  })

  it('theTitleStaysOneLineOfText', async () => {
    mount()
    const field = (await screen.findByLabelText('Page title')) as HTMLTextAreaElement
    await userEvent.clear(field)
    await userEvent.type(field, 'Line one{Enter}')
    expect(field.value).toBe('Line one') // Enter finishes the title, it does not add a line
    expect(document.activeElement).not.toBe(field)
  })

  it('aDraftShowsThePublishButtonAndPublishing', async () => {
    nodesApi.publishNode.mockResolvedValue({ ...NODE, publishState: 'PUBLISHED' })
    mount()
    await screen.findByRole('banner')
    expect(screen.getByText('Draft')).toBeTruthy() // pill and sentence of the properties block
    expect(screen.getByText("Still a draft. Publish it when it’s final.")).toBeTruthy()
    await userEvent.click(bar().getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(nodesApi.publishNode).toHaveBeenCalledWith('n1'))
    await waitFor(() => expect(screen.queryByText('Draft')).toBeNull()) // the page is published now
  })

  it('aPublishedPageWithNoNewerEditsShowsPublishedTextInsteadOfTheButton', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, publishState: 'PUBLISHED', contentUpdatedAt: ago(5) })
    versionsApi.listVersions.mockResolvedValue([PUBLISHED_VERSION])
    mount()
    await waitFor(() => expect(bar().getByText('Published')).toBeTruthy())
    expect(bar().queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
  })

  it('aPublishedPageEditedSinceShowsPublishAndCompare', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, publishState: 'PUBLISHED', contentUpdatedAt: ago(1) })
    versionsApi.listVersions.mockResolvedValue([PUBLISHED_VERSION])
    mount()
    await screen.findByRole('banner')
    expect(bar().getByRole('button', { name: 'Publish' })).toBeTruthy()
    expect(await screen.findByText('Edited since it was last published.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }))
    // history opens in the right panel, and the bar above the page says what is being compared
    expect((await screen.findAllByText(/with the current page/))[0]).toBeTruthy()
    expect(within(screen.getByRole('complementary', { name: 'Details' })).getByText('Version history')).toBeTruthy()
    expect(versionsApi.getVersion).toHaveBeenCalledWith('v1')
  })

  it('aViewerSeesPublishedButNeverPublishOrCompare', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, publishState: 'PUBLISHED', access: 'VIEW', canManage: false })
    mount()
    await waitFor(() => expect(bar().getByText('Published')).toBeTruthy())
    expect(bar().queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
  })

  it('whenSomeoneElseIsEditingTheBarSaysReadOnlyAndPublishIsGone', async () => {
    contentApi.acquireEditLock.mockResolvedValue({ mine: false, holder: { id: 'u2', name: 'Rafi Ahmed' }, expiresAt: '' })
    mount()
    await waitFor(() => expect(bar().getByText('Read-only')).toBeTruthy())
    expect(bar().queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(bar().queryByText('Saved')).toBeNull()
    expect(screen.getByText('is editing right now.', { exact: false }).textContent).toContain('Rafi Ahmed')
    await userEvent.click(screen.getByRole('button', { name: 'Open read-only' }))
    expect(bar().getByText('Read-only')).toBeTruthy() // still read-only after choosing to read
  })

  it('propertiesListStatusTagsAndLastEdited', async () => {
    mount()
    expect(await screen.findByText('Last edited')).toBeTruthy()
    expect(screen.getByText('Rafi Ahmed', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('2 h ago')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'srs' }).getAttribute('href')).toBe('/tags/srs')
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })
})

describe('the details panel', () => {
  it('hasCommentsFilesAndSummaryTabsWithCounts', async () => {
    extras.getComments.mockResolvedValue([{ id: 'c1', content: 'hi', createdAt: ago(1), createdByUserId: 'u2', createdByFullName: 'Rafi Ahmed', createdByEmail: 'r@x' }])
    extras.getAttachments.mockResolvedValue([
      { id: 'f1', originalName: 'notes.pdf', url: null, contentType: 'application/pdf', size: 2048, uploadedAt: ago(1) },
      { id: 'f2', originalName: 'Spec', url: 'https://example.com', contentType: null, size: null, uploadedAt: ago(1) },
    ])
    mount()
    const panel = await screen.findByRole('complementary', { name: 'Details' })
    await waitFor(() => expect(within(panel).getByRole('tab', { name: /Files/ }).textContent).toContain('2'))
    expect(within(panel).getByRole('tab', { name: /Comments/ }).textContent).toContain('1')
    await userEvent.click(within(panel).getByRole('tab', { name: /Files/ }))
    expect(await within(panel).findByRole('link', { name: 'notes.pdf' })).toBeTruthy()
    // QA-29: two files with the same name differ by when they were uploaded (full date on hover)
    const meta = within(panel).getByText(/^2 KB/)
    expect(meta.textContent).toMatch(/^2 KB · (just now|\d+ min ago|\d+ h ago)$/)
    expect(meta.querySelector('time')?.getAttribute('title')).toMatch(/\d{4}/)
    expect(within(panel).getByRole('link', { name: 'Spec' }).getAttribute('target')).toBe('_blank')
    expect(within(panel).getByRole('button', { name: 'Upload a file' })).toBeTruthy() // editors upload
    await userEvent.click(within(panel).getByRole('tab', { name: 'Summary' }))
    expect(within(panel).getByRole('button', { name: 'Summarize this page' })).toBeTruthy()
  })

  it('theOldSectionsAreGoneFromThePageBody', async () => {
    mount()
    await screen.findByRole('complementary', { name: 'Details' })
    expect(screen.queryByRole('region', { name: 'Comments' })).toBeNull()
    expect(screen.queryByText('Add a comment')).toBeNull()
    expect(screen.queryByText(/Your team can see this page/)).toBeNull() // no full-width draft bar
  })

  it('theToggleClosesItAndRemembersForThisScreen', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Details', pressed: true }))
    expect(shell.set).toHaveBeenCalledWith(false)
    expect(localStorage.getItem('kf.details.page')).toBe('0')
  })

  it('aFilesOnlyViewerCannotUpload', async () => {
    nodesApi.getNode.mockResolvedValue({ ...NODE, access: 'VIEW', canManage: false })
    mount()
    const panel = await screen.findByRole('complementary', { name: 'Details' })
    await userEvent.click(within(panel).getByRole('tab', { name: /Files/ }))
    expect(await within(panel).findByText('No files on this page.')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Upload a file' })).toBeNull()
  })
})
