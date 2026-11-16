import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import Markdown from './Markdown'

afterEach(cleanup)

const show = (text: string, sources?: { n: number; id: string; title: string }[]) =>
  render(<MemoryRouter><Markdown text={text} sources={sources} /></MemoryRouter>)

// QA-28: AI answers showed "- ", **, backticks and 【2】 as typed.
test('renders lists, bold, italic and code from model output', () => {
  const { container } = show('Key points:\n\n- **Transformer** uses *attention*\n- trains on `WMT 2014`\n\n1. first\n2. second')
  expect(container.querySelectorAll('ul > li')).toHaveLength(2)
  expect(container.querySelectorAll('ol > li')).toHaveLength(2)
  expect(container.querySelector('strong')?.textContent).toBe('Transformer')
  expect(container.querySelector('em')?.textContent).toBe('attention')
  expect(container.querySelector('code')?.textContent).toBe('WMT 2014')
  expect(container.textContent).not.toMatch(/\*\*|`|^- /)
})

test('never renders HTML from the text', () => {
  const { container } = show('<img src=x onerror="alert(1)"> <b>hi</b>')
  expect(container.querySelector('img, b')).toBeNull()
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
})

test('citations become links to their source page; unknown ones are dropped', () => {
  show('BLEU **28.4** [2], also 【1】 and [9].', [{ n: 2, id: 'p2', title: 'Attention notes' }, { n: 1, id: 'p1', title: 'Survey papers' }])
  expect(screen.getByRole('link', { name: 'Source 2: Attention notes' }).getAttribute('href')).toBe('/p/p2')
  expect(screen.getByRole('link', { name: 'Source 1: Survey papers' }).getAttribute('href')).toBe('/p/p1')
  expect(document.body.textContent).not.toMatch(/\[9\]|【|】/)
})
