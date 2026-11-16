import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
})
