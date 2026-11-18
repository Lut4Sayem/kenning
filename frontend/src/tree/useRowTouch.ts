import { useEffect } from 'react'

let lastPointer = ''

/**
 * Media queries can't tell a mouse from a finger (touch laptops report a coarse pointer and no hover even when a mouse is
 * used), so the sidebar watches real input instead: a finger on a row marks it `data-touched`, which shows that row's
 * buttons until the next press somewhere else.
 */
export function useRowTouch() {
  useEffect(() => {
    let row: Element | null = null
    const down = (e: PointerEvent) => {
      lastPointer = e.pointerType
      const hit = e.pointerType === 'touch' && e.target instanceof Element ? e.target.closest('[data-row]') : null
      if (hit === row) return
      row?.removeAttribute('data-touched')
      row = hit
      row?.setAttribute('data-touched', '')
    }
    const key = () => { lastPointer = '' } // the Menu key and Shift+F10 open the row menu even after a finger tap
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [])
}

/** The row menu's Move dialog is a DOM child of the row: its presses must not drag the page or open the row menu. */
export const inDialog = (e: React.SyntheticEvent) => e.target instanceof Element && !!e.target.closest('dialog')

/** Right-click on a row opens its "…" menu (QA-18). A finger's long press is a drag, so touch is left alone. */
export function openRowMenu(e: React.MouseEvent<HTMLElement>) {
  if (lastPointer === 'touch' || inDialog(e)) return
  const more = e.currentTarget.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
  if (!more) return // no menu (viewers): keep the browser's own
  e.preventDefault()
  if (more.getAttribute('aria-expanded') !== 'true') more.click()
}
