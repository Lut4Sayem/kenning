import { useEffect, useId, useRef, useState } from 'react'
import s from './FormDialog.module.css'

export interface FormDialogProps {
  title: string
  label: string
  submitLabel: string
  maxLength?: number
  /** Starting text (e.g. the current name when renaming); it is selected when the dialog opens. */
  initial?: string
  /** Resolves when done (the caller closes the dialog); a rejection shows its message under the field. */
  onSubmit: (value: string) => Promise<unknown>
  onClose: () => void
}

/** A one-field modal (white, radius 20, max 480; DESIGN.md section 6): "New team", "New space". */
export default function FormDialog({ title, label, submitLabel, maxLength = 100, initial = '', onSubmit, onClose }: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement as HTMLElement | null
    if (typeof dialog.showModal === 'function') dialog.showModal() // jsdom has none
    else dialog.setAttribute('open', '')
    input.current?.select()
    return () => {
      if (typeof dialog.close === 'function') dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(value.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby={`${id}-t`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}>
      <form onSubmit={submit}>
        <h2 id={`${id}-t`} className={s.title}>{title}</h2>
        <label htmlFor={`${id}-f`} className={s.label}>{label}</label>
        <input id={`${id}-f`} ref={input} className={s.input} value={value} maxLength={maxLength} autoComplete="off"
          onChange={(e) => setValue(e.target.value)} aria-describedby={error ? `${id}-e` : undefined} aria-invalid={error ? true : undefined} />
        {error && <p id={`${id}-e`} className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={s.primary} disabled={!value.trim() || busy}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  )
}
