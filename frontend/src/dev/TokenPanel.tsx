import { useEffect, useRef, useState } from 'react'
import s from './TokenPanel.module.css'

// Development only (mounted from main.tsx behind import.meta.env.DEV): tweak the main tokens live, then paste the CSS into tokens.css.
const COLOR_TOKENS = ['--ground', '--canvas', '--surface-card', '--hover', '--ink', '--ink-doc', '--ink-muted', '--primary', '--accent', '--accent-soft', '--link', '--line', '--line-soft']
const TEXT_TOKENS = ['--line', '--line-soft'] // rgb() with alpha: a colour input cannot hold them
const KEY = 'kf.devtokens'

type Overrides = Record<string, string>

function load(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Overrides
  } catch {
    return {}
  }
}

const root = () => document.documentElement
const current = (name: string) => getComputedStyle(root()).getPropertyValue(name).trim()

export default function TokenPanel() {
  const [open, setOpen] = useState(false)
  const [over, setOver] = useState<Overrides>(load)
  const [note, setNote] = useState('')
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    for (const [k, v] of Object.entries(over)) root().style.setProperty(k, v)
    try {
      localStorage.setItem(KEY, JSON.stringify(over))
    } catch {
      // ignore: the tweaks just are not remembered
    }
  }, [over])

  const close = () => { setOpen(false); btn.current?.focus() }
  const set = (name: string, value: string) => setOver((o) => ({ ...o, [name]: value }))

  function reset() {
    for (const k of Object.keys(over)) root().style.removeProperty(k)
    setOver({})
    setNote('Reset to tokens.css')
  }

  async function copy() {
    const names = [...new Set([...COLOR_TOKENS, ...TEXT_TOKENS])]
    const css = `:root {\n${names.map((n) => `  ${n}: ${over[n] ?? current(n)};`).join('\n')}\n}`
    try {
      await navigator.clipboard.writeText(css)
      setNote('Copied')
    } catch {
      setNote('Could not copy: the browser blocked the clipboard')
    }
  }

  return (
    <>
      <button ref={btn} type="button" className={s.fab} aria-expanded={open} aria-controls="kf-token-panel" onClick={() => (open ? close() : setOpen(true))}>
        Tokens
      </button>
      {open && (
        <div id="kf-token-panel" role="group" aria-label="Design tokens" className={s.panel} onKeyDown={(e) => { if (e.key === 'Escape') close() }}>
          <h2>Design tokens</h2>
          {COLOR_TOKENS.filter((n) => !TEXT_TOKENS.includes(n)).map((n) => (
            <div className={s.row} key={n}>
              <label htmlFor={`tok${n}`}><code>{n}</code></label>
              <input id={`tok${n}`} type="color" value={over[n] ?? current(n)} onChange={(e) => set(n, e.target.value)} />
            </div>
          ))}
          {TEXT_TOKENS.map((n) => (
            <div className={s.row} key={n}>
              <label htmlFor={`tok${n}`}><code>{n}</code></label>
              <input id={`tok${n}`} type="text" value={over[n] ?? current(n)} onChange={(e) => set(n, e.target.value)} />
            </div>
          ))}
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={reset}>Reset</button>
            <button type="button" className={s.btn} onClick={() => void copy()}>Copy CSS</button>
          </div>
          <p className={s.status} role="status">{note}</p>
        </div>
      )}
    </>
  )
}
