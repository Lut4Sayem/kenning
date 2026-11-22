// @vitest-environment node
// The collaboration service builds the search text itself (collab/src/extractText.ts, no BlockNote in Node).
// Both read the same fixtures, so the page text is the same whichever side made it.
import { ServerBlockNoteEditor } from '@blocknote/server-util'
import { getDocument } from '@blocknote/server-util/dom'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import pages from '../../../collab/test/fixtures/pages.json'
import { fromBase64 } from './base64'
import { extractText } from './extractText'
import { FRAGMENT, kfSchema } from './schema'

describe('extractText parity fixtures', () => {
  const server = ServerBlockNoteEditor.create({ schema: kfSchema }, getDocument())
  it.each(pages.map((p) => [p.name, p] as const))('%s', (_, page) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, fromBase64(page.state))
    expect(extractText(server.yDocToBlocks(doc, FRAGMENT))).toBe(page.text)
  })
})
