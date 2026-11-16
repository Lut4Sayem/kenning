import { BlockNoteEditor } from '@blocknote/core'
import { yDocToBlocks } from '@blocknote/core/yjs'
import * as Y from 'yjs'
import { fromBase64 } from './base64'
import { extractText } from './extractText'
import { FRAGMENT, kfSchema, type KfEditor } from './schema'

let converter: BlockNoteEditor<never, never, never> | undefined
const editor = () => (converter ??= BlockNoteEditor.create({ schema: kfSchema }) as never)

/** Plain text of a page document without a mounted editor (same result as extractText on the open editor). */
export function docText(ydoc: Y.Doc): string {
  return extractText(yDocToBlocks(editor(), ydoc, FRAGMENT))
}

export type KfBlock = KfEditor['document'][number]

/** The blocks of a saved page state (base64 Yjs update, as versions are stored); [] for an empty state. */
export function stateBlocks(state: string): KfBlock[] {
  if (!state) return []
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, fromBase64(state))
  return yDocToBlocks(editor(), ydoc, FRAGMENT) as unknown as KfBlock[]
}
