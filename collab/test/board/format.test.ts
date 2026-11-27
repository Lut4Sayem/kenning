import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS, EMPTY_BOARD_STATE, META } from '../../src/board/format.js'

describe('board format', () => {
  it('emptyBoardStateDecodes', () => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(EMPTY_BOARD_STATE, 'base64'))
    expect(doc.getMap(META).get('formatVersion')).toBe(1)
    expect(doc.getMap(ELEMENTS).size).toBe(0)
  })

  it('emptyBoardStateSameInFrontend', () => {
    const text = readFileSync(new URL('../../../frontend/src/board/format.ts', import.meta.url), 'utf8')
    expect(text).toContain(`'${EMPTY_BOARD_STATE}'`)
  })
})
