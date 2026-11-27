// Same result as collab/src/board/extractBoardText.ts (which reads the Yjs map); pinned by collab/test/fixtures/boards.json.
type El = { id?: string; type: string; isDeleted?: boolean; index?: string | null; text?: string; originalText?: string }

export function extractBoardText(elements: readonly El[]): string {
  return [...elements]
    .filter((e) => e.type === 'text' && !e.isDeleted)
    .sort((a, b) => (a.index == null ? 1 : 0) - (b.index == null ? 1 : 0) || (a.index! < b.index! ? -1 : a.index! > b.index! ? 1 : 0) || ((a.id ?? '') < (b.id ?? '') ? -1 : 1))
    .map((e) => e.originalText ?? e.text ?? '')
    .filter((t) => t.trim() !== '')
    .join('\n')
}
