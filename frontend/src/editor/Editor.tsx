import '@blocknote/mantine/style.css'
import './editor.css'
import { filterSuggestionItems } from '@blocknote/core'
import { withCollaboration } from '@blocknote/core/yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, useCreateBlockNote, type DefaultReactSuggestionItem } from '@blocknote/react'
import { useState } from 'react'
import type * as Y from 'yjs'
import { uploadAttachment } from '../api/attachments'
import { safeHttpUrl } from './BookmarkBlock'
import { extractText } from './extractText'
import { FRAGMENT, kfSchema, type KfEditor } from './schema'
import SlashMenu from './SlashMenu'
import { getKfSlashItems } from './slashItems'
import { kfTheme } from './theme'

/**
 * Editor bound to the page's local Y.Doc; with a provider it shows the others' cursors and sends this user's.
 * `editable` is part of the editor's identity: flipping it on a live BlockNote editor leaves Ctrl+Z dead
 * (the Yjs undo manager does not survive it), so a change builds a fresh editor on the same Y.Doc.
 * The undo history starts over at that moment, which only happens when this user's access changes.
 * Files (image and file blocks, drag-drop) upload to the page only while it is editable; `onError` gets the server's message.
 */
export function useKfEditor(
  ydoc: Y.Doc,
  user: { name: string; color: string },
  editable: boolean,
  files?: { nodeId: string; onError: (message: string) => void; onUploaded?: () => void },
  provider?: HocuspocusProvider | null,
): KfEditor {
  return useCreateBlockNote(
    withCollaboration({
      schema: kfSchema,
      domAttributes: { editor: { 'aria-label': 'Page content' } },
      uploadFile:
        editable && files
          ? async (file: File) => {
              try {
                const url = await uploadAttachment(files.nodeId, file)
                files.onUploaded?.() // QA-23: e.g. the Files tab count
                return url
              } catch (e) {
                files.onError(e instanceof Error ? e.message : 'Upload failed')
                throw e
              }
            }
          : undefined,
      collaboration: { fragment: ydoc.getXmlFragment(FRAGMENT), user, ...(provider?.awareness ? { provider: { awareness: provider.awareness } } : {}) },
    }),
    [ydoc, editable, files?.nodeId, provider],
  ) as KfEditor
}

export default function Editor({ editor, editable }: { editor: KfEditor; editable: boolean }) {
  // A lone http(s) link pasted into the page: remembered so "Create bookmark" can turn it into a card.
  const [offer, setOffer] = useState<{ url: string; blockId: string } | null>(null)

  const onPaste = (e: React.ClipboardEvent) => {
    if (!editable) return
    const text = e.clipboardData?.getData('text/plain')?.trim() ?? ''
    if (/\s/.test(text) || !safeHttpUrl(text)) return setOffer(null)
    setTimeout(() => {
      // after the default paste has put the link into the page
      try {
        setOffer({ url: text, blockId: editor.getTextCursorPosition().block.id })
      } catch {
        setOffer({ url: text, blockId: editor.document[editor.document.length - 1].id })
      }
    }, 0)
  }

  const createBookmark = () => {
    if (!offer) return
    const block = editor.getBlock(offer.blockId)
    const props = { url: offer.url }
    if (block && extractText([block]).trim() === offer.url) editor.replaceBlocks([block], [{ type: 'bookmark', props }])
    else editor.insertBlocks([{ type: 'bookmark', props }], block ?? editor.document[editor.document.length - 1], 'after')
    setOffer(null)
  }

  return (
    <div onPasteCapture={onPaste}>
      <BlockNoteView editor={editor} editable={editable} slashMenu={false} theme={kfTheme}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query): Promise<DefaultReactSuggestionItem[]> => filterSuggestionItems(getKfSlashItems(editor), query)}
          suggestionMenuComponent={SlashMenu}
        />
      </BlockNoteView>
      {editable && offer && (
        <p className="kf-offer" role="status">
          Link pasted.{' '}
          <button type="button" onClick={createBookmark}>
            Create bookmark
          </button>{' '}
          <button type="button" onClick={() => setOffer(null)}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  )
}
