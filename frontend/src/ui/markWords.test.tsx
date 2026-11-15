import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { markWords } from './markWords'

it('marks every query word, ignores case and regex characters', () => {
  const { container } = render(<p>{markWords('Room booking (v2) research', 'BOOKING (v2')}</p>)
  expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['booking', '(v2'])
  expect(container.textContent).toBe('Room booking (v2) research')
})
