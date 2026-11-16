import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import Avatar, { AvatarStack } from './Avatar'

// QA-52: authors saved before names were required come back with name null.
test('an avatar without a name shows "?" instead of crashing', () => {
  const { container } = render(<><Avatar name={null} /><AvatarStack names={[null, 'Rafi Hasan']} /></>)
  expect([...container.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent)).toContain('?')
  expect(container.textContent).toContain('RH')
})
