// Plain text of a page for search and diff, read straight from the Yjs tree (no BlockNote in Node).
// Must give exactly what the browser's frontend/src/editor/extractText.ts gives: one line per block, table rows
// tab-joined, status labels, bookmark "title url", caption/name fallback, empty lines dropped.
// Pinned by the shared fixtures in test/fixtures/pages.json.
import * as Y from 'yjs'

type Node = Y.XmlElement | Y.XmlText

const children = (el: Y.XmlElement | Y.XmlFragment) => el.toArray().filter((c): c is Node => c instanceof Y.XmlElement || c instanceof Y.XmlText)

function inline(el: Y.XmlElement): string {
  return children(el)
    .map((c) => {
      if (c instanceof Y.XmlText) return c.toDelta().map((d: { insert: unknown }) => (typeof d.insert === 'string' ? d.insert : '')).join('')
      if (c.nodeName === 'status') return String(c.getAttribute('label') ?? '')
      return inline(c) // links, table cells and anything else that wraps text
    })
    .join('')
}

/** One blockContainer: its content element, then an optional blockGroup of children. */
function blockLines(container: Y.XmlElement): string[] {
  const parts = children(container).filter((c): c is Y.XmlElement => c instanceof Y.XmlElement)
  const content = parts.find((c) => c.nodeName !== 'blockGroup')
  const group = parts.find((c) => c.nodeName === 'blockGroup')
  let own: string[] = []
  if (content?.nodeName === 'table') {
    own = descendants(content, 'tableRow').map((row) =>
      children(row).filter((c): c is Y.XmlElement => c instanceof Y.XmlElement).map(inline).join('\t'),
    )
  } else if (content?.nodeName === 'bookmark') {
    own = [[content.getAttribute('title'), content.getAttribute('url')].filter(Boolean).join(' ')]
  } else if (content) {
    own = [inline(content) || String(content.getAttribute('caption') ?? content.getAttribute('name') ?? '')]
  }
  return [...own, ...(group ? groupLines(group) : [])]
}

function descendants(el: Y.XmlElement, name: string): Y.XmlElement[] {
  return children(el).flatMap((c) => (c instanceof Y.XmlElement ? (c.nodeName === name ? [c] : descendants(c, name)) : []))
}

const groupLines = (group: Y.XmlElement | Y.XmlFragment): string[] =>
  children(group).flatMap((c) => (c instanceof Y.XmlElement ? (c.nodeName === 'blockContainer' ? blockLines(c) : groupLines(c)) : []))

export function extractText(fragment: Y.XmlFragment): string {
  return groupLines(fragment)
    .filter((line) => line.trim() !== '')
    .join('\n')
}
