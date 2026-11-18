import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../api/search'
import Shell from '../app/Shell'

const api = vi.hoisted(() => ({ searchAll: vi.fn(), getRecent: vi.fn() }))
vi.mock('../api/search', () => api)
vi.mock('../api/spaces', async (orig) => ({
  ...(await orig<typeof import('../api/spaces')>()),
  getMe: async () => ({ id: 'u1', fullName: 'Ann', email: 'a@x.test' }),
  getMyTeams: async () => [],
  getMySpaces: async () => [],
}))
vi.mock('../api/nodes', () => ({ getTree: async () => [], createNode: vi.fn() }))

// cmdk needs these; jsdom has neither
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.scrollIntoView = () => {}

const hit = (id: string, title: string): SearchHit => ({
  type: 'PAGE', nodeId: id, teamId: null, spaceId: 's1', spaceName: 'Docs', title, path: '', snippetHtml: '', tags: [], publishState: 'PUBLISHED', archived: false,
})

function Opened() {
  return <p>opened {useParams().nodeId}</p>
}

function Where() {
  const l = useLocation()
  return <p>at {l.pathname}{l.search}</p>
}

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/p/:nodeId" element={<Opened />} />
            <Route path="/search" element={<Where />} />
            <Route path="*" element={<p>home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const dialog = () => screen.findByRole('dialog', { name: 'Search pages and actions' })

beforeEach(() => {
  api.getRecent.mockResolvedValue([hit('p1', 'Roadmap'), hit('p2', 'Standup notes')])
  api.searchAll.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('command palette', () => {
  it('opensOnCtrlK', async () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(await dialog()).toBeTruthy()
  })

  it('opensOnCmdK', async () => {
    setup()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(await dialog()).toBeTruthy()
  })

  it('inputHasFocusRightAfterOpening', async () => {
    setup()
    await userEvent.keyboard('{Control>}k{/Control}road') // typed at once: nothing may be lost
    expect((await screen.findByRole('combobox') as HTMLInputElement).value).toBe('road')
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
  })

  it('seeAllOpensTheSearchPage', async () => {
    setup()
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.keyboard('run book')
    await userEvent.click(await screen.findByRole('option', { name: 'See all results for “run book”' }))
    expect(await screen.findByText('at /search?q=run%20book')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('emptyShowsRecent', async () => {
    setup()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(await screen.findByText('Roadmap')).toBeTruthy()
    expect(screen.getByText('Standup notes')).toBeTruthy()
  })

  it('enterOpensPage', async () => {
    setup()
    await userEvent.keyboard('{Control>}k{/Control}')
    await screen.findByText('Roadmap')
    await userEvent.keyboard('{ArrowDown}{Enter}') // first item is preselected: down moves to the second
    expect(await screen.findByText('opened p2')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('escRestoresFocus', async () => {
    setup()
    const trigger = await screen.findByRole('button', { name: /^Search/ })
    trigger.focus()
    await userEvent.click(trigger)
    await dialog()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('staleResponsesIgnored', async () => {
    const answers: Record<string, (r: SearchHit[]) => void> = {}
    api.searchAll.mockImplementation(({ q }: { q: string }) => new Promise((res) => { answers[q] = res }))
    setup()
    await userEvent.keyboard('{Control>}k{/Control}')
    await dialog()
    await userEvent.keyboard('a')
    await waitFor(() => expect(answers.a).toBeTruthy(), { timeout: 2000 })
    await userEvent.keyboard('b')
    await waitFor(() => expect(answers.ab).toBeTruthy(), { timeout: 2000 })
    answers.ab([hit('n', 'Newer answer')])
    expect(await screen.findByText('Newer answer')).toBeTruthy()
    answers.a([hit('o', 'Older answer')]) // arrives late: must not replace the newer one
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Older answer')).toBeNull()
    expect(screen.getByText('Newer answer')).toBeTruthy()
  })

  it('tabSwitchesTheFilterAndKeepsFocusInTheBox', async () => {
    api.searchAll.mockResolvedValue([{ ...hit('c1', 'Budget'), snippetHtml: 'the <mark>road</mark> ahead' }])
    setup()
    await userEvent.keyboard('{Control>}k{/Control}road')
    await screen.findByText('in Budget')
    const pressed = () => screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)
    expect(pressed()[0]).toMatch(/^All/)
    await userEvent.keyboard('{Tab}')
    expect(pressed()[0]).toMatch(/^Pages/)
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    await userEvent.keyboard('{Tab}')
    expect(pressed()[0]).toMatch(/^Content/)
    expect(screen.getByText('in Budget')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /See all results/ })).toBeNull() // actions are filtered out
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(pressed()[0]).toMatch(/^Pages/)
  })

  it('titleMatchesAnywhereGoInPagesAndRankAboveContent', async () => {
    api.searchAll.mockResolvedValue([
      { ...hit('c1', 'Budget'), snippetHtml: 'uses <mark>retrieval</mark>' },
      hit('t1', 'Dense Retrieval notes'),
    ])
    setup()
    await userEvent.keyboard('{Control>}k{/Control}retrieval')
    await screen.findByText('in Budget')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toContain('Dense Retrieval notes') // the title match comes first in All
    expect(screen.queryByText('in Dense Retrieval notes')).toBeNull() // and is not repeated under content
    await userEvent.keyboard('{Tab}')
    expect(screen.getAllByRole('button', { pressed: true })[0].textContent).toMatch(/^Pages\s*1/)
    expect(screen.getByRole('option', { name: /Dense Retrieval notes/ })).toBeTruthy()
  })

  it('showsAtMostFivePerGroupInAll', async () => {
    api.getRecent.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => hit(x, `Page ${x}`)))
    setup()
    await userEvent.keyboard('{Control>}k{/Control}')
    await screen.findByText('Page a')
    expect(screen.queryByText('Page f')).toBeNull()
    await userEvent.keyboard('{Tab}') // Pages filter: the whole list
    expect(await screen.findByText('Page g')).toBeTruthy()
  })
})
