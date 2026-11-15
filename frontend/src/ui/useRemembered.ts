import { useState } from 'react'

/** Open/closed state that survives a reload. Storage can be blocked: then it just starts open (`initial`). */
export function useRemembered(key: string, initial = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? initial : v !== '0'
    } catch {
      return initial
    }
  })
  const toggle = () => {
    try {
      localStorage.setItem(key, open ? '0' : '1')
    } catch {
      // ignore: the choice just is not remembered
    }
    setOpen(!open)
  }
  return [open, toggle]
}
