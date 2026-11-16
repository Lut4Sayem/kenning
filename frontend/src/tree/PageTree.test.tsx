import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PageTree from './PageTree'

const nodesApi = vi.hoisted(() => ({ getTree: vi.fn(), createNode: vi.fn(), moveNode: vi.fn() }))
vi.mock('../api/nodes', () => nodesApi)

const Where = () => <p data-testid="where">{useLocation().pathname}</p>

function renderTree() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
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

    await screen.findByRole('link', { name: 'Alpha' })
    expect(screen.queryByText('Draft')).toBeNull()
  })

  const page = (id: string, title: string, parentId: string | null = null, rank = 'V') =>
    ({ id, parentId, rank, title, icon: null, type: 'PAGE', publishState: 'PUBLISHED', locked: false, titleOnly: false })

  it('dragAnnouncementsUseTitlesNotIds', async () => {
    // QA-14: the live region read "Draggable item 6afa2fb4... was moved over droppable area in:6afa..."
    nodesApi.getTree.mockResolvedValue([page('6afa2fb4d03ff45cfc1c7d67', 'Methodology'), page('b', 'Related work', null, 'W')])
    renderTree()
    const grip = await screen.findByRole('button', { name: 'Move Methodology' })
    expect(document.getElementById(grip.getAttribute('aria-describedby')!)?.textContent).toMatch(/Press Space to pick up/)

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
})
