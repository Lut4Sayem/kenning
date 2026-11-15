import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'
import { Fragment, useEffect, useRef } from 'react'
import s from './SlashMenu.module.css'


/** "Mod-Alt-1" -> "Ctrl Alt 1" (Cmd on a Mac). */
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const shortcut = (badge: string) => badge.split('-').map((k) => (k === 'Mod' ? (mac ? '⌘' : 'Ctrl') : k)).join(' ')

/**
 * The "/" menu: white, grouped, an icon tile + name + one-line description per item. BlockNote still owns the
 * keyboard (arrows, Enter, Esc) and tells us which index is selected; we only draw it.
 */
export default function SlashMenu({ items, selectedIndex, onItemClick, loadingState }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const selected = useRef<HTMLDivElement>(null)
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // getKfSlashItems already sorted the items by group, so BlockNote's selectedIndex (arrow keys) matches what is drawn.
  const order = items.map((_, i) => i)
  let last = ''

  return (
    <div id="bn-suggestion-menu" className={s.menu} role="listbox" aria-label="Insert a block" onMouseDown={(e) => e.preventDefault()}>
      {order.length === 0 && <p className={s.empty}>{loadingState === 'loaded' ? 'No blocks match.' : 'Loading…'}</p>}
      {order.map((i) => {
        const item = items[i]
        const group = item.group ?? 'Others'
        const head = group !== last ? group : null
        last = group
        const on = i === selectedIndex
        return (
          <Fragment key={item.title}>
            {head && <div className={s.group} role="presentation">{head}</div>}
            <div id={`bn-suggestion-menu-item-${i}`} ref={on ? selected : undefined} role="option" aria-selected={on} className={s.item} onClick={() => onItemClick?.(item)}>
              <span className={s.tile} aria-hidden="true">{item.icon}</span>
              <span className={s.text}>
                <span className={s.name}>{item.title}</span>
                {item.subtext && <span className={s.desc}>{item.subtext}</span>}
              </span>
              {item.badge && <kbd className={s.kbd}>{shortcut(item.badge)}</kbd>}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
