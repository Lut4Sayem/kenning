import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { extractText } from '../src/extractText.js'
import pages from './fixtures/pages.json' with { type: 'json' }

describe('extractText matches the browser', () => {
  it.each(pages.map((p) => [p.name, p] as const))('%s', (_, page) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(page.state, 'base64'))
    expect(extractText(doc.getXmlFragment('document-store'))).toBe(page.text)
  })
})
