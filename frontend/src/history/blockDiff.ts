import { diffWords } from 'diff'
import type { KfBlock } from '../editor/docText'
import { extractText } from '../editor/extractText'

export type BlockMark = 'added' | 'removed' | 'changed'

const own = (b: KfBlock) => JSON.stringify([b.type, b.props, b.content])
const textOf = (b: KfBlock) => extractText([{ ...b, children: [] }])

/**
 * One document that shows `next` with the changes since `prev` (QA-21). Blocks are matched by id (ids survive
 * edits in the shared Yjs history). Unchanged blocks keep their formatting. A block whose text changed shows the
 * words added (style backgroundColor "kf-ins") and removed (strike + textColor "kf-del"); added, removed and
 * otherwise changed blocks (images, files, tables, code) are listed in `marks`. Removed blocks stay where they were.
 * shortcut: a block with changed text shows that text without its own bold/links; diff styled runs if that matters.
 */
export function diffBlocks(prev: KfBlock[], next: KfBlock[]): { blocks: KfBlock[]; marks: Record<string, BlockMark> } {
  const marks: Record<string, BlockMark> = {}
  const before = new Map<string, KfBlock>()
  const after = new Set<string>()
  const index = (list: KfBlock[], f: (b: KfBlock) => void) => list.forEach((b) => { f(b); index(b.children as KfBlock[], f) })
  index(prev, (b) => before.set(b.id, b))
  index(next, (b) => after.add(b.id))

  const merge = (oldList: KfBlock[], newList: KfBlock[]): KfBlock[] => {
    const out = newList.map((b): KfBlock => {
      const old = before.get(b.id)
      if (!old) {
        marks[b.id] = 'added'
        return b
      }
      const merged = { ...b, children: merge(old.children as KfBlock[], b.children as KfBlock[]) } as KfBlock
      if (own(old) === own(b)) return merged
      const [was, now] = [textOf(old), textOf(b)]
      if (old.type === b.type && Array.isArray(b.content) && b.type !== 'codeBlock' && was !== now) {
        const content = diffWords(was, now).map((p) => ({
          type: 'text' as const,
          text: p.value,
          styles: p.added ? { backgroundColor: 'kf-ins' } : p.removed ? { strike: true, textColor: 'kf-del' } : {},
        }))
        return { ...merged, content } as KfBlock
      }
      marks[b.id] = 'changed'
      return merged
    })
    oldList.forEach((gone, i) => {
      if (after.has(gone.id)) return
      marks[gone.id] = 'removed'
      let at = 0
      for (let j = i - 1; j >= 0 && !at; j--) at = out.findIndex((x) => x.id === oldList[j].id) + 1
      out.splice(at, 0, gone)
    })
    return out
  }
  return { blocks: merge(prev, next), marks }
}
