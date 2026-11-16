import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../api/search'
import Search from './Search'

const api = vi.hoisted(() => ({ searchAll: vi.fn() }))
vi.mock('../api/search', () => api)
const spaces = vi.hoisted(() => ({ getMySpaces: vi.fn(async () => [
  { id: 's1', name: 'Literature Review', icon: null, ownerType: 'TEAM', teamId: 't1', teamName: 'Thesis', myRole: 'EDITOR' },
  { id: 'me', name: 'Private', icon: null, ownerType: 'USER', teamId: null, teamName: null, myRole: null },
]) }))
vi.mock('../api/spaces', () => spaces)

const page = (over: Partial<SearchHit>): SearchHit => ({
  type: 'PAGE', nodeId: 'p1', teamId: null, spaceId: 's1', spaceName: 'Docs', title: 'Runbook', path: '',
  snippetHtml: 'the <mark>runbook</mark> &lt;b&gt;', tags: ['ops'], publishState: 'DRAFT', archived: false, ...over,
})

function setup(url: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}><Search /></MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('search page', () => {
  it('emptyBoxShowsHelpAndSendsNothing', () => {
    setup('/search')
    expect(screen.getByText('Find anything your teams have written')).toBeTruthy()
    expect(api.searchAll).not.toHaveBeenCalled()
  })

  it('tagAndStatusGoToTheServer', async () => {
    api.searchAll.mockResolvedValue([page({})])
    setup('/search?tag=ops&status=DRAFT')
    expect(await screen.findByRole('link', { name: 'Runbook' })).toBeTruthy()
    expect(api.searchAll).toHaveBeenCalledWith({ q: '', tag: 'ops', publishState: 'DRAFT', spaceId: '', limit: 50 })
    expect(screen.getByText('Draft', { selector: 'span' })).toBeTruthy()
  })

  // QA-32: a Space filter, one place for tags, and no big title on a list view.
  it('spaceFilterGoesToTheServer', async () => {
    api.searchAll.mockResolvedValue([page({})])
    setup('/search?q=runbook')
    await screen.findByRole('link', { name: 'Runbook' })
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Space' }), 'Thesis · Literature Review')
    expect(api.searchAll).toHaveBeenLastCalledWith({ q: 'runbook', tag: '', publishState: '', spaceId: 's1', limit: 50 })
    expect(screen.getByRole('option', { name: 'Private pages' })).toBeTruthy()
  })

  it('tagChipsOpenTheTagPageLikeEverywhereElse', async () => {
    api.searchAll.mockResolvedValue([page({})])
    setup('/search?q=runbook')
    expect((await screen.findByRole('link', { name: '#ops' })).getAttribute('href')).toBe('/tags/ops')
    expect(screen.getByRole('heading', { level: 1, name: 'Search' }).className).toBe('sr-only')
  })

  it('snippetKeepsMarkAndEscapesTheRest', async () => {
    api.searchAll.mockResolvedValue([page({})])
    setup('/search?q=runbook')
    const mark = await screen.findByText('runbook', { selector: 'mark' })
    expect(mark).toBeTruthy()
    expect(mark.parentElement?.textContent).toBe('the runbook <b>')
  })

  it('removingTheTagChipSearchesAgainWithoutIt', async () => {
    api.searchAll.mockResolvedValue([page({})])
    setup('/search?q=runbook&tag=ops')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove tag filter ops' }))
    expect(screen.queryByRole('button', { name: 'Remove tag filter ops' })).toBeNull()
    expect(api.searchAll).toHaveBeenLastCalledWith({ q: 'runbook', tag: '', publishState: '', spaceId: '', limit: 50 })
  })

  it('noMatchOffersClearFilters', async () => {
    api.searchAll.mockResolvedValue([])
    setup('/search?q=zzz&status=DRAFT')
    expect(await screen.findByText('Nothing matches “zzz”')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('failureShowsMessageAndRetry', async () => {
    api.searchAll.mockRejectedValue(new Error('boom'))
    setup('/search?q=x')
    expect((await screen.findByRole('alert')).textContent).toContain('Search failed. boom')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('showsThreePerGroupThenShowAll', async () => {
    api.searchAll.mockResolvedValue(['a', 'b', 'c', 'd'].map((x) => page({ nodeId: x, title: `Page ${x}` })))
    setup('/search?q=page')
    await screen.findByRole('link', { name: 'Page a' })
    expect(screen.queryByRole('link', { name: 'Page d' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 4' }))
    expect(await screen.findByRole('link', { name: 'Page d' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Pages/, selected: true })).toBeTruthy()
  })

  it('metaRowShowsPlaceEditorAndSpacesLink', async () => {
    api.searchAll.mockResolvedValue([
      page({ teamName: 'Thesis', spaceName: 'Docs', path: 'Guides', updatedByName: 'Rafi Ahmed', updatedAt: new Date().toISOString() }),
      { ...page({}), type: 'SPACE', nodeId: null, teamId: 't1', spaceId: 's9', title: 'Room booking', teamName: 'Robotics', publishState: null, snippetHtml: '', tags: [] },
    ])
    setup('/search?q=room')
    expect(await screen.findByText('Thesis / Docs / Guides')).toBeTruthy()
    expect(screen.getByText('Last edited by Rafi Ahmed')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Room booking' }).getAttribute('href')).toBe('/s/s9')
    expect(screen.getByText('Robotics')).toBeTruthy()
  })
})
