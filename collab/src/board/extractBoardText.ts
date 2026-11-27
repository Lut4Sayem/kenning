// Search text of a board, read from the Yjs elements map. Must match frontend/src/board/extractBoardText.ts;
// pinned by the shared fixtures in test/fixtures/boards.json.
import * as Y from 'yjs'
import { ELEMENTS } from './format.js'

type El = { id: string; type: string; isDeleted?: boolean; index?: string | null; text?: string; originalText?: string }

export function extractBoardText(doc: Y.Doc): string {
  return [...doc.getMap<El>(ELEMENTS).values()]
    .filter((e) => e.type === 'text' && !e.isDeleted)
    .sort((a, b) => (a.index == null ? 1 : 0) - (b.index == null ? 1 : 0) || (a.index! < b.index! ? -1 : a.index! > b.index! ? 1 : 0) || (a.id < b.id ? -1 : 1))
    .map((e) => e.originalText ?? e.text ?? '')
    .filter((t) => t.trim() !== '')
    .join('\n')
}
