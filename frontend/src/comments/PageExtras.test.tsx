import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmHost } from '../ui/ConfirmDialog'
import { AskPanel, Comments, Summary } from './PageExtras'

const x = vi.hoisted(() => ({ getComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(), summarize: vi.fn(), ask: vi.fn() }))
const spaces = vi.hoisted(() => ({ getMe: vi.fn() }))
vi.mock('../api/pageExtras', () => x)
vi.mock('../api/spaces', () => spaces)

const c = (id: string, by: string) => ({ id, content: `text ${id}`, createdAt: '2026-01-01T00:00:00Z', createdByUserId: by, createdByFullName: by, createdByEmail: `${by}@x` })

function wrap(ui: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}><ConfirmHost /><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('page comments', () => {
  it('listsAddsAndDeletesOnlyOwnComments', async () => {
    spaces.getMe.mockResolvedValue({ id: 'me' })
    x.getComments.mockResolvedValue([c('1', 'me'), c('2', 'other')])
    x.addComment.mockResolvedValue(c('3', 'me'))
    x.deleteComment.mockResolvedValue({})
    wrap(<Comments nodeId="n1" />)
    expect(await screen.findByText('text 2')).toBeTruthy()
    expect(await screen.findAllByRole('button', { name: 'Delete comment' })).toHaveLength(1)
    await userEvent.type(screen.getByLabelText('Write a comment'), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send comment' }))
    expect(x.addComment).toHaveBeenCalledWith('n1', 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete comment' }))
    expect(x.deleteComment).toHaveBeenCalledWith('1')
  })

  it('emptyCommentCannotBeSent', async () => {
    spaces.getMe.mockResolvedValue({ id: 'me' })
    x.getComments.mockResolvedValue([])
    wrap(<Comments nodeId="n1" />)
    expect(await screen.findByText(/No comments yet/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send comment' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('comment cap', () => {
  it('showsTheTwentyNewestAndLoadsEarlierOnRequest', async () => {
    spaces.getMe.mockResolvedValue({ id: 'me' })
    x.getComments.mockResolvedValue(Array.from({ length: 25 }, (_, i) => c(String(i + 1), 'other')))
    wrap(<Comments nodeId="n1" />)
    expect(await screen.findByText('text 25')).toBeTruthy()
    expect(screen.queryByText('text 5')).toBeNull() // 1..5 are earlier than the newest 20
    await userEvent.click(screen.getByRole('button', { name: 'Load earlier comments' }))
    expect(screen.getByText('text 1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load earlier comments' })).toBeNull()
  })
})

describe('AI controls', () => {
  it('summarizeShowsTheSummary', async () => {
    x.summarize.mockResolvedValue({ summary: 'Short version', cached: false, trimmed: false, generatedAt: '' })
    wrap(<Summary nodeId="n1" spaceId="s1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Summarize this page' }))
    expect(await screen.findByText('Short version')).toBeTruthy()
  })

  it('summaryAndAnswerRenderMarkdownAndCitationLinks', async () => {
    // QA-28: raw "- ", ** and 【2】 were shown as typed
    x.summarize.mockResolvedValue({ summary: '- **BLEU** 28.4\n- trained on `WMT`', cached: false, trimmed: false, generatedAt: '' })
    wrap(<Summary nodeId="n1" spaceId="s1" />)
    const container = document.body
    await userEvent.click(screen.getByRole('button', { name: 'Summarize this page' }))
    expect((await screen.findByText('BLEU')).tagName).toBe('STRONG')
    expect(container.querySelectorAll('section[aria-label="Summary"] li')).toHaveLength(2)

    x.ask.mockResolvedValueOnce({ answer: 'It scored **28.4** [2].', sources: [{ n: 2, id: 'p2', title: 'Attention notes' }], usedDocuments: 2, trimmed: false, cached: false })
    await userEvent.type(screen.getByLabelText('Question'), 'BLEU?')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect((await screen.findByRole('link', { name: 'Source 2: Attention notes' })).getAttribute('href')).toBe('/p/p2')
    expect(container.textContent).not.toContain('**')
  })

  it('summarizeShowsTheServersMessageOnLimit', async () => {
    x.summarize.mockRejectedValue(new Error("You've used today's 20 AI requests. Resets at 00:00 UTC."))
    wrap(<Summary nodeId="n1" spaceId="s1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Summarize this page' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Resets at 00:00 UTC/)
  })

  it('askShowsAnswerWithSourceLinksAndHidesWhenNotConfigured', async () => {
    x.ask.mockResolvedValueOnce({ answer: 'Use Atlas', sources: [{ n: 1, id: 'p9', title: 'Search' }], usedDocuments: 1, trimmed: false, cached: false })
    wrap(<AskPanel spaceId="s1" />)
    await userEvent.type(screen.getByLabelText('Question'), 'how?')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Use Atlas')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/p/p9')
    x.ask.mockRejectedValueOnce(new Error('AI is not configured on this server'))
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await vi.waitFor(() => expect(screen.queryByLabelText('Question')).toBeNull())
  })
})
