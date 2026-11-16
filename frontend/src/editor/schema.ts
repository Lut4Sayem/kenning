// The one editor schema. The browser editor and any Node code that builds content must both import it from here,
// otherwise content built in Node would not open in the browser. Keep this file free of CSS imports.
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, type Extension } from '@blocknote/core'
import { bookmarkBlock } from './BookmarkBlock'
import { statusInline } from './StatusBlock'

/** Y.XmlFragment that holds a page. BlockNote's helpers default to "prosemirror": always pass this. */
export const FRAGMENT = 'document-store'

/**
 * What a page with no saved content starts from: one empty paragraph, encoded once with a fixed Yjs client id.
 * Every tab must start a new page from these exact bytes. If each one let the editor create its own first
 * block, their documents would have unrelated roots, and merging two of them (stale save, D6) makes the
 * editor throw one side's text away. The test in schema.node.test.ts regenerates and compares it.
 */
export const EMPTY_PAGE_STATE =
  'AQcBAAcBDmRvY3VtZW50LXN0b3JlAwpibG9ja0dyb3VwBwABAAMOYmxvY2tDb250YWluZXIHAAEBAwlwYXJhZ3JhcGgoAAECD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1bHQoAAECCXRleHRDb2xvcgF3B2RlZmF1bHQoAAECDXRleHRBbGlnbm1lbnQBdwRsZWZ0KAABAQJpZAF3C2ZpcnN0LWJsb2NrAA=='

/**
 * QA-20: BlockNote's own rule turns "```word " into a code block whose (invisible) language is "word", so the word
 * vanishes. Here the text after ``` becomes the block's first line instead, with the cursor after it.
 */
const codeRule: NonNullable<Extension['inputRules']>[number] = {
  find: /^```(.*?)\s$/,
  replace: ({ match, editor }) => {
    const text = match[0].slice(3).trimStart()
    if (!text) return { type: 'codeBlock', props: {}, content: [] }
    const id = editor.getTextCursorPosition().block.id
    queueMicrotask(() => editor.setTextCursorPosition(id, 'end')) // BlockNote puts it at the start
    return { type: 'codeBlock', props: {}, content: text }
  },
}
const codeBlock = {
  ...defaultBlockSpecs.codeBlock,
  extensions: defaultBlockSpecs.codeBlock.extensions?.map((ext) =>
    typeof ext === 'function' ? (ctx: Parameters<typeof ext>[0]) => ({ ...ext(ctx), inputRules: [codeRule] }) : { ...ext, inputRules: [codeRule] },
  ),
}

/** QA-51: BlockNote's to-do checkbox has no accessible name; it gets "To-do" plus the item's text. */
const checkList = defaultBlockSpecs.checkListItem
const checkListItem = {
  ...checkList,
  implementation: {
    ...checkList.implementation,
    render(...args: Parameters<NonNullable<typeof checkList.implementation.render>>) {
      const out = checkList.implementation.render!.apply(this as never, args)
      const box = 'querySelector' in out.dom ? out.dom.querySelector('input') : null
      if (box && out.contentDOM) {
        box.id = `kf-todo-${args[0].id}`
        out.contentDOM.id = `kf-todo-text-${args[0].id}`
        box.setAttribute('aria-label', 'To-do')
        box.setAttribute('aria-labelledby', `${box.id} ${out.contentDOM.id}`) // "To-do Read the paper"; an empty item is still "To-do"
      }
      return out
    },
  },
}

export const kfSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, codeBlock, checkListItem, bookmark: bookmarkBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, status: statusInline },
})

export type KfEditor = typeof kfSchema.BlockNoteEditor
