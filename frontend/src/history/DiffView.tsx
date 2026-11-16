import '@blocknote/mantine/style.css'
import '../editor/editor.css'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useMemo, useRef } from 'react'
import type { VersionAuthor } from '../api/versions'
import { stateBlocks } from '../editor/docText'
import { kfSchema } from '../editor/schema'
import { kfTheme } from '../editor/theme'
import { authorTint } from './authorColours'
import { diffBlocks, type BlockMark } from './blockDiff'
import s from './History.module.css'

/**
 * A version (`state`) as the page looks, read-only, with what changed since `previousState`: words added (tint
 * background + underline in the author's colour) and removed (struck through, rose), whole blocks added, removed or changed.
 */
export default function DiffView({ state, previousState, authors }: { state: string; previousState: string; authors: VersionAuthor[] }) {
  const tint = authorTint(authors)
  const diff = useMemo(() => diffBlocks(stateBlocks(previousState), stateBlocks(state)), [state, previousState])
  return (
    <div className={s.diff} style={{ '--ins-bg': `var(--tint-${tint}-bg)`, '--ins-line': `var(--tint-${tint}-fg)` } as React.CSSProperties}>
      <VersionDoc blocks={diff.blocks} marks={diff.marks} />
      <p className={s.legend}>
        <span aria-hidden="true" className={s.swatch} />
        {authors.length ? `${authors.map((a) => a.name).join(', ')}'s changes` : 'Changes'}
        <span>Struck-through text was removed</span>
      </p>
    </div>
  )
}

function VersionDoc({ blocks, marks }: { blocks: ReturnType<typeof diffBlocks>['blocks']; marks: Record<string, BlockMark> }) {
  const editor = useCreateBlockNote({ schema: kfSchema, initialContent: blocks.length ? blocks : undefined }, [blocks])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Block marks go on BlockNote's own block elements, which only exist once the view has drawn the document.
    const mark = () => {
      box.current?.querySelectorAll('[data-node-type="blockOuter"]').forEach((el) => {
        const kind = marks[el.getAttribute('data-id') ?? '']
        if (kind) el.setAttribute('data-diff', kind)
      })
    }
    mark()
    const frame = requestAnimationFrame(mark)
    return () => cancelAnimationFrame(frame)
  }, [editor, marks])
  return (
    <div ref={box} className={s.doc}>
      <BlockNoteView editor={editor} editable={false} theme={kfTheme} sideMenu={false} formattingToolbar={false} slashMenu={false} linkToolbar={false} />
    </div>
  )
}
