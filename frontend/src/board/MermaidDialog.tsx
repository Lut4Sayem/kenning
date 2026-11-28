import { useEffect, useId, useRef, useState } from 'react'
import { mermaidToBoard, type BoardElements } from './mermaid'
import f from '../ui/FormDialog.module.css'
import s from './Board.module.css'

interface Props {
  onInsert: (elements: BoardElements) => void
  onClose: () => void
}

/** Paste Mermaid code, get real shapes (WB 7.5). Anything that isn't shapes shows a message here; the dialog stays open. */
export default function MermaidDialog({ onInsert, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement as HTMLElement | null
    if (typeof dialog.showModal === 'function') dialog.showModal() // jsdom has none
    else dialog.setAttribute('open', '')
    return () => {
      if (typeof dialog.close === 'function') dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const result = await mermaidToBoard(code)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    onInsert(result.elements)
    onClose()
  }

  return (
    <dialog ref={ref} className={`${f.dialog} ${s.mermaid}`} aria-labelledby={`${id}-t`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}>
      <form onSubmit={submit}>
        <h2 id={`${id}-t`} className={f.title}>Mermaid to shapes</h2>
        <label htmlFor={`${id}-f`} className={f.label}>Mermaid code (flowchart, sequence or class diagram)</label>
        <textarea id={`${id}-f`} className={`${f.input} ${f.note} ${s.code}`} rows={10} spellCheck={false} autoFocus value={code}
          placeholder={'flowchart LR\n  A[Idea] --> B[Plan]'} onChange={(e) => setCode(e.target.value)}
          aria-describedby={error ? `${id}-e` : undefined} aria-invalid={error ? true : undefined} />
        {error && <p id={`${id}-e`} className={`${f.error} ${s.code}`} role="alert">{error}</p>}
        <div className={f.actions}>
          <button type="button" className={f.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={f.primary} disabled={busy}>{busy ? 'Drawing…' : 'Insert'}</button>
        </div>
      </form>
    </dialog>
  )
}
