/** Every enabled menuitem* inside a [role="menu"] under `root`. */
export const menuItems = (root: HTMLElement | null) =>
  [...(root?.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]:not(:disabled)') ?? [])]

/**
 * Moves focus between the menu items under `root`: ArrowDown/ArrowUp (wrapping), Home/End.
 * Returns true when it handled the key (the caller then prevents the default scroll).
 */
export function moveMenuFocus(key: string, root: HTMLElement | null): boolean {
  const all = menuItems(root)
  const i = all.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return false
  const n = all.length
  const next = key === 'ArrowDown' ? (i + 1) % n : key === 'ArrowUp' ? (i - 1 + n) % n : key === 'Home' ? 0 : key === 'End' ? n - 1 : -1
  if (next < 0) return false
  all[next].focus()
  return true
}
