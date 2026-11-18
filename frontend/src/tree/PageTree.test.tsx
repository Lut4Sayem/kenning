import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PageTree from './PageTree'
import { useRowTouch } from './useRowTouch'

const nodesApi = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn(), moveNode: vi.fn(), getNode: vi.fn() }))
vi.mock('../api/nodes', () => nodesApi)

const Touch = () => { useRowTouch(); return null }
const Where = () => <p data-testid="where">{useLocation().pathname}</p>

function renderTree() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Touch />
        <PageTree spaceId="s1" />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  Object.values(nodesApi).forEach((f) => f.mockReset())
})

describe('PageTree', () => {
  it('eachPageShowsItsOwnColourDot', async () => { // QA-47; no colour = the default gray
    nodesApi.getTree.mockResolvedValue([
      { id: 'a', parentId: null, rank: 'a', title: 'Green page', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false, color: 'green' },
      { id: 'b', parentId: null, rank: 'b', title: 'Plain page', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false, color: null },
    ])
    renderTree()
    const dot = async (name: string) => ((await screen.findByRole('treeitem', { name })).previousElementSibling as HTMLElement).style.background
    expect(await dot('Green page')).toBe('var(--page-green)')
    expect(await dot('Plain page')).toBe('var(--page-gray)')
  })

  it('subPageButtonCreatesUnderThatPageAndOpensIt', async () => {
    nodesApi.getTree.mockResolvedValue([
      { id: 'a', parentId: null, rank: 'V', title: 'Alpha', icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false },
    ])
    nodesApi.createNode.mockResolvedValue({ id: 'child1' })
    renderTree()

    await userEvent.click(await screen.findByRole('button', { name: 'New sub-page under Alpha' }))

    expect(nodesApi.createNode).toHaveBeenCalledWith('s1', { parentId: 'a' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/child1'))
    expect(JSON.parse(localStorage.getItem('kf.expanded.s1')!)).toEqual(['a']) // parent stays open
  })

  it('showsTheServerMessageWhenCreateFails', async () => {
    nodesApi.getTree.mockResolvedValue([
      { id: 'a', parentId: null, rank: 'V', title: 'Alpha', icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false },
    ])
    nodesApi.createNode.mockRejectedValue(new Error("You can't add pages to this space"))
    renderTree()

    await userEvent.click(await screen.findByRole('button', { name: 'New sub-page under Alpha' }))

    expect((await screen.findByRole('alert')).textContent).toBe("You can't add pages to this space")
  })

  it('showsNoDraftMarkerOnDraftPages', async () => {
    nodesApi.getTree.mockResolvedValue([
      { id: 'a', parentId: null, rank: 'V', title: 'Alpha', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false },
    ])
    renderTree()

    await screen.findByRole('treeitem', { name: 'Alpha' })
    expect(screen.queryByText('Draft')).toBeNull()
  })

  const page = (id: string, title: string, parentId: string | null = null, rank = 'V') =>
    ({ id, parentId, rank, title, icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false })

  it('dragAnnouncementsUseTitlesNotIds', async () => {
    // QA-14: the live region read "Draggable item 6afa2fb4... was moved over droppable area in:6afa..."
    nodesApi.getTree.mockResolvedValue([page('6afa2fb4d03ff45cfc1c7d67', 'Methodology'), page('b', 'Related work', null, 'W')])
    renderTree()
    const grip = await screen.findByRole('button', { name: 'Drag to move Methodology' })
    expect(document.getElementById(grip.getAttribute('aria-describedby')!)?.textContent).toMatch(/Press Space to pick up/)
    expect(grip.title).toBe('Drag to move') // QA-15: says what it does; Move to… is in the page menu

    const said: string[] = []
    const heard = new MutationObserver(() => document.querySelectorAll('[aria-live]').forEach((e) => e.textContent && said.push(e.textContent)))
    heard.observe(document.body, { subtree: true, childList: true, characterData: true })
    grip.focus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(said.join(' | ')).toContain('Picked up Methodology.'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(said.join(' | ')).toContain('Methodology was not moved.'))
    heard.disconnect()
    expect(said.join(' | ')).not.toMatch(/6afa2fb4|inside Methodology/)
  })

  it('treeIsOneTabStopWithArrowKeys', async () => {
    // QA-45: every row was three Tab stops and the arrow keys did nothing
    nodesApi.getTree.mockResolvedValue([page('a', 'Alpha'), page('a1', 'Alpha child', 'a'), page('b', 'Beta', null, 'W')])
    renderTree()
    const alpha = await screen.findByRole('treeitem', { name: 'Alpha' })
    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getAllByRole('treeitem').filter((e) => e.tabIndex === 0)).toEqual([alpha])

    await userEvent.tab()
    expect(document.activeElement).toBe(alpha)
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Beta' }))
    await userEvent.keyboard('{ArrowUp}{ArrowRight}')
    expect(alpha.getAttribute('aria-expanded')).toBe('true')
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Alpha child' }))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(alpha)
    await userEvent.keyboard('{ArrowLeft}')
    expect(alpha.getAttribute('aria-expanded')).toBe('false')
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Beta' }))
    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(alpha)

    // The focused row's actions come next on Tab, then the tree is left: no other row adds stops.
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New sub-page under Alpha' }))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Alpha' }))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drag to move Alpha' }))
    await userEvent.tab()
    expect(document.activeElement?.closest('[role="tree"]')).toBeNull()

    await userEvent.click(alpha)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/a'))
  })

  it('rightClickOnARowOpensItsPageMenu', async () => { // QA-18
    nodesApi.getTree.mockResolvedValue([{ id: 'a', parentId: null, rank: 'a', title: 'Alpha', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false }])
    nodesApi.getNode.mockResolvedValue({ id: 'a', spaceId: 's1', title: 'Alpha', status: 'ACTIVE', publishState: 'DRAFT', locked: false, canManage: true, color: null })
    renderTree()
    await userEvent.pointer({ keys: '[MouseRight]', target: await screen.findByRole('treeitem', { name: 'Alpha' }) })
    const menu = await screen.findByRole('menu', { name: 'More actions for Alpha' })
    expect(menu.textContent).toContain('Move to trash')
    await waitFor(() => expect(document.activeElement?.closest('[role="menu"]')).toBe(menu))
  })

  it('aRowMenuThatFailedToLoadTriesAgainOnTheNextClick', async () => {
    nodesApi.getTree.mockResolvedValue([{ id: 'a', parentId: null, rank: 'a', title: 'Alpha', icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false }])
    nodesApi.getNode.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ id: 'a', spaceId: 's1', title: 'Alpha', status: 'ACTIVE', publishState: 'DRAFT', locked: false, canManage: true, color: null })
    renderTree()
    const more = await screen.findByRole('button', { name: 'More actions for Alpha' })
    await userEvent.click(more)
    await waitFor(() => expect(more.title).toMatch(/try again/))
    await userEvent.click(more)
    expect(await screen.findByRole('menu', { name: 'More actions for Alpha' })).toBeTruthy()
  })

  it('aTapShowsThatRowsButtonsUntilTheNextTapElsewhere', async () => {
    nodesApi.getTree.mockResolvedValue(['Alpha', 'Beta'].map((title, i) => ({ id: title, parentId: null, rank: String(i), title, icon: null, type: 'PAGE', publishState: 'DRAFT', locked: false, titleOnly: false })))
    renderTree()
    const row = async (name: string) => (await screen.findByRole('treeitem', { name })).closest('[data-row]')!
    const tap = async (name: string, pointerType: string) =>
      (await row(name)).dispatchEvent(Object.assign(new MouseEvent('pointerdown', { bubbles: true }), { pointerType }))
    await tap('Alpha', 'touch')
    expect((await row('Alpha')).hasAttribute('data-touched')).toBe(true)
    await tap('Beta', 'touch')
    expect((await row('Alpha')).hasAttribute('data-touched')).toBe(false)
    expect((await row('Beta')).hasAttribute('data-touched')).toBe(true)
    await tap('Alpha', 'mouse') // a mouse has hover: nothing stays shown
    expect((await row('Beta')).hasAttribute('data-touched')).toBe(false)
    expect((await row('Alpha')).hasAttribute('data-touched')).toBe(false)
  })
})
