// Same result as collab/src/board/extractBoardText.ts (which reads the Yjs map); pinned by collab/test/fixtures/boards.json.
type El = { id?: string; type: string; isDeleted?: boolean; index?: string | null; text?: unknown; originalText?: unknown }

const str = (s: unknown) => (typeof s === 'string' ? s : undefined)

export function extractBoardText(elements: readonly unknown[]): string {
  return elements
    .filter((e): e is El => typeof e === 'object' && e !== null && (e as El).type === 'text' && !(e as El).isDeleted)
    .sort((a, b) => (a.index == null ? 1 : 0) - (b.index == null ? 1 : 0) || (a.index! < b.index! ? -1 : a.index! > b.index! ? 1 : 0) || ((a.id ?? '') < (b.id ?? '') ? -1 : 1))
    .map((e) => str(e.originalText) ?? str(e.text) ?? '')
    .filter((t) => t.trim() !== '')
    .join('\n')
}
