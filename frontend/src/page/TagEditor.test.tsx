import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NodeDetail } from '../api/nodes'
import TagEditor from './TagEditor'

const nodesApi = vi.hoisted(() => ({ updateNode: vi.fn() }))
vi.mock('../api/nodes', () => nodesApi)

const NODE = { id: 'n1', tags: [] as string[] } as NodeDetail

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// QA-24: the field stays open for the next tag, and shows the lowercase it will be stored as.
describe('TagEditor', () => {
  it('staysOpenAfterEnterAndShowsTagsInLowercase', async () => {
    let tags: string[] = []
    nodesApi.updateNode.mockImplementation(async (_id: string, body: { tags: string[] }) => ({ ...NODE, tags: (tags = body.tags) }))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><TagEditor node={NODE} canEdit /></MemoryRouter>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.type(screen.getByLabelText('Add tag'), 'Week 1')
    expect((screen.getByLabelText('Add tag') as HTMLInputElement).value).toBe('week 1')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(tags).toEqual(['week 1']))
    expect(document.activeElement).toBe(screen.getByLabelText('Add tag'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByLabelText('Add tag')).toBeNull()
  })

  // QA-66: the second tag must not be built from the list before the first save came back.
  it('twoTagsAddedBackToBackBothReachTheServer', async () => {
    const sent: string[][] = []
    nodesApi.updateNode.mockImplementation(async (_id: string, body: { tags: string[] }) => {
      sent.push(body.tags)
      await new Promise((r) => setTimeout(r, 300))
      return { ...NODE, tags: body.tags }
    })
    // like PageView: the node comes from the query cache that TagEditor writes to
    function Host() {
      const { data } = useQuery({ queryKey: ['node', 'n1'], queryFn: () => NODE, initialData: NODE, staleTime: Infinity })
      return <TagEditor node={data} canEdit />
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Host /></MemoryRouter>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.type(screen.getByLabelText('Add tag'), 'Thesis{Enter}draft{Enter}')
    await waitFor(() => expect(sent.at(-1)).toEqual(['thesis', 'draft']))
    await waitFor(() => expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['thesis', 'draft']))
  })

  // QA-44: at the limit there is no Add, the count says so, and an old error goes once a change saves.
  it('atTwentyTagsHidesAddAndAnErrorClearsOnTheNextSave', async () => {
    const full = { ...NODE, tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }
    nodesApi.updateNode.mockRejectedValueOnce(new Error('A page can have at most 20 tags'))
    nodesApi.updateNode.mockImplementation(async (_id: string, body: { tags: string[] }) => ({ ...full, tags: body.tags }))
    function Host() {
      const { data } = useQuery({ queryKey: ['node', 'n1'], queryFn: () => full, initialData: full, staleTime: Infinity })
      return <TagEditor node={data} canEdit />
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Host /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(screen.getByText('20 of 20 tags')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag t0' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag t1' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })
})
