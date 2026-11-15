import { useEffect, useState } from 'react'
import Icon from './Icon'
import s from './Toast.module.css'

type Kind = 'info' | 'error'
interface Item { id: number; text: string; kind: Kind }

let push: ((text: string, kind: Kind) => void) | null = null
let next = 1
const SHOW_MS = 6000

/** A short message bottom-right (DESIGN.md section 6, level 3). Needs <ToastHost /> (App mounts it); plain code can call it too. */
export function toast(text: string, kind: Kind = 'info') {
  push?.(text, kind)
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    push = (text, kind) => {
      const id = next++
      setItems((list) => [...list.slice(-2), { id, text, kind }]) // at most 3 on screen
      window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), SHOW_MS)
    }
    return () => { push = null }
  }, [])

  // The live region is always in the page: one that appears together with its message is often not read out.
  return (
    <div className={s.host} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`${s.toast} ${t.kind === 'error' ? s.error : ''}`}>
          {t.kind === 'error' && <Icon name="info" size={16} />}
          <span className={s.text}>{t.text}</span>
          <button type="button" className={s.close} aria-label="Dismiss" onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
