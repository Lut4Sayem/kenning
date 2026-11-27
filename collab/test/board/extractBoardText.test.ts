import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { extractBoardText } from '../../src/board/extractBoardText.js'
import { ELEMENTS } from '../../src/board/format.js'
import boards from '../fixtures/boards.json' with { type: 'json' }

describe('boardTextFromFixtures', () => {
  it.each(boards.map((b) => [b.name, b] as const))('%s', (_, board) => {
    const doc = new Y.Doc()
    const map = doc.getMap(ELEMENTS)
    for (const e of [...board.elements].reverse()) map.set(e.id, e) // insertion order differs from index order
    expect(extractBoardText(doc)).toBe(board.text)
  })
})

describe('boardTextOddValues', () => {
  it('skipsNonObjectValues', () => {
    const doc = new Y.Doc()
    const map = doc.getMap<unknown>(ELEMENTS)
    map.set('s', 'text')
    map.set('n', null)
    map.set('a', { id: 'a', type: 'text', index: 'a0', text: 'kept' })
    expect(extractBoardText(doc)).toBe('kept')
  })
})
