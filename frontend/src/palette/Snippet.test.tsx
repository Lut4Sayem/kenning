import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { safeHttpUrl } from '../editor/BookmarkBlock'
import Snippet from './Snippet'

afterEach(cleanup)

describe('XSS guards', () => {
  it('keeps <mark> but never renders other tags or attributes from a snippet', () => {
    const { container } = render(
      <Snippet html={'a <mark>hit</mark> <img src=x onerror=alert(1)> <mark onclick=alert(1)>x</mark> <script>alert(1)</script>'} />,
    )
    expect(container.querySelectorAll('mark')).toHaveLength(1)
    expect(container.querySelector('img, script, [onclick], [onerror]')).toBeNull()
  })

  it('only allows http(s) bookmark links', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHttpUrl(' https://example.test/a ')).toBe('https://example.test/a')
  })
})
