import type { BoardUndo } from './undo'

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
export function undoKeyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): 'undo' | 'redo' | null {
  const key = e.key.toLowerCase()
  if (!(e.ctrlKey || e.metaKey)) return null
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo'
  return null
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || (t instanceof HTMLElement && t.isContentEditable)

/**
 * Board undo/redo keys go to our own history, caught before Excalidraw (capture phase) so its history never runs.
 * While text is being typed the editor keeps its own in-text undo.
 */
export function bindUndoKeys(target: HTMLElement, undo: Pick<BoardUndo, 'undo' | 'redo'>): () => void {
  const onKey = (e: KeyboardEvent) => {
    const action = undoKeyAction(e)
    if (!action || typing(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    if (action === 'undo') undo.undo()
    else undo.redo()
  }
  target.addEventListener('keydown', onKey, true)
  return () => target.removeEventListener('keydown', onKey, true)
}
