// @vitest-environment node
// The collaboration service builds the board's search text itself; both read the same fixtures.
import { describe, expect, it } from 'vitest'
import boards from '../../../collab/test/fixtures/boards.json'
import { extractBoardText } from './extractBoardText'

describe('extractBoardText parity fixtures', () => {
  it.each(boards.map((b) => [b.name, b] as const))('%s', (_, board) => {
    expect(extractBoardText(board.elements)).toBe(board.text)
  })
})
