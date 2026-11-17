// Decorative background for login, register and join: a dot grid, six app fragments joined to the form card by thin
// curves, and two named cursors. aria-hidden and never focusable; CSS decides what shows at each width.
import { useEffect, useRef, useState, type RefObject } from 'react'
import s from './AuthStage.module.css'

type Line = { d: string; a: [number, number]; b: [number, number]; o: string }

/** Soft S from a to b: leaves flat, bends, arrives flat (controls at 45% and 55% of the width). Exported for the test. */
export function wave(a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0]
  const r = (n: number) => Math.round(n * 10) / 10
  return `M${r(a[0])} ${r(a[1])} C${r(a[0] + dx * 0.45)} ${r(a[1])} ${r(a[0] + dx * 0.55)} ${r(b[1])} ${r(b[0])} ${r(b[1])}`
}

const RISE = 48

/** Two gentle bends (~20px each) through a midpoint above both ends; every joint stays flat. */
export function doubleWave(a: [number, number], b: [number, number]) {
  const m: [number, number] = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 20]
  return wave(a, m) + wave(m, b).replace(/^M\S+ \S+/, '')
}

/**
 * The card-side end's height for a fragment whose inner edge sits at height y, on a card whose usable side runs
 * from top to bottom. Every line rises or falls at least 48px: the card end moves toward or away from the card's
 * centre, never the fragment. null = 48px does not fit, draw a double wave instead.
 */
export function cardEndY(y: number, top: number, bottom: number): number | null {
  const clamped = Math.min(Math.max(y, top), bottom)
  if (Math.abs(clamped - y) >= RISE) return clamped
  const centre = (top + bottom) / 2
  const options = [y + RISE, y - RISE].filter((v) => v >= top && v <= bottom)
  if (!options.length) return null
  return options.sort((p, q) => Math.abs(p - centre) - Math.abs(q - centre))[0]
}

/** A wave from each linked fragment's inner edge to the form card, redrawn when either one resizes. */
function useLines(stage: RefObject<HTMLDivElement>, form: RefObject<HTMLElement>) {
  const [lines, setLines] = useState<Line[]>([])
  useEffect(() => {
    const el = stage.current
    const card = form.current
    if (!el || !card || typeof ResizeObserver === 'undefined') return
    const draw = () => {
      const st = el.getBoundingClientRect()
      const f = card.getBoundingClientRect()
      const fx = (f.left + f.right) / 2 - st.left
      const out: Line[] = []
      el.querySelectorAll<HTMLElement>('[data-link]').forEach((n) => {
        const r = n.getBoundingClientRect()
        if (!r.width || getComputedStyle(n).display === 'none') return
        const left = (r.left + r.right) / 2 - st.left < fx
        const a: [number, number] = [left ? r.right - st.left + 6 : r.left - st.left - 6, (r.top + r.bottom) / 2 - st.top]
        const top = f.top - st.top + 48, bottom = f.bottom - st.top - 48
        const y = cardEndY(a[1], top, bottom)
        const b: [number, number] = [left ? f.left - st.left - 10 : f.right - st.left + 10, y ?? Math.min(Math.max(a[1], top), bottom)]
        out.push({ d: y === null ? doubleWave(a, b) : wave(a, b), a, b, o: getComputedStyle(n).opacity })
      })
      setLines(out)
    }
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    ro.observe(card)
    void document.fonts?.ready.then(draw)
    return () => ro.disconnect()
  }, [stage, form])
  return lines
}

function Cursor({ cls, name }: { cls: string; name: string }) {
  return (
    <div className={`${s.cursor} ${cls}`}>
      <svg width="18" height="20" viewBox="0 0 18 20">
        <path d="M1.5 1.5 16 9.2l-6.4 1.6-3.3 6.6z" fill="var(--who)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className={s.name}><span className={s.cav}>{name[0]}</span>{name}</span>
    </div>
  )
}

const Check = () => <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.6 3.6 6.6 7.5 2.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>

export default function AuthStage({ form }: { form: RefObject<HTMLElement> }) {
  const stage = useRef<HTMLDivElement>(null)
  const lines = useLines(stage, form)
  return (
    <div className={s.stage} aria-hidden="true" data-auth-stage ref={stage}>
      <div className={s.glow} />
      <svg className={s.lines}>
        {lines.map((l) => (
          <g key={l.d} opacity={l.o}><path d={l.d} /><circle cx={l.a[0]} cy={l.a[1]} r="3" /><circle cx={l.b[0]} cy={l.b[1]} r="3" /></g>
        ))}
      </svg>
      <div className={`${s.frag} ${s.card} ${s.wide}`} data-link>
        <p className={s.title}><span className={s.dot} />API design notes</p>
        <p className={s.meta}>Backend · edited 2 min ago</p>
        <div className={s.tags}><span className={s.tag}>spring</span><span className={s.tag}>auth</span></div>
      </div>
      <div className={`${s.frag} ${s.note} ${s.extra} ${s.half}`} data-link>
        <p className={s.title}>Weekly sync, 14 Nov</p>
        <p className={`${s.todo} ${s.done}`}><span className={s.box}><Check /></span><span>Split the schema task</span></p>
        <p className={s.todo}><span className={s.box} /><span>Ayesha: review PR #44</span></p>
        <p className={s.todo}><span className={s.box} /><span>Rafi: write the demo script</span></p>
      </div>
      <div className={`${s.frag} ${s.code} ${s.extra} ${s.half}`} data-link>{'POST '}<b>/api/nodes/7f3a/publish</b>{'\n200 { "status": "PUBLISHED" }'}</div>
      <div className={`${s.frag} ${s.files} ${s.extra} ${s.faded}`} data-link>
        <p className={s.title}>Files</p>
        <p className={s.row}><span className={s.ficon}>PNG</span><span>er-diagram.png</span><small>240 KB</small></p>
        <p className={s.row}><span className={`${s.ficon} ${s.pdf}`}>PDF</span><span>demo-slides.pdf</span><small>1.8 MB</small></p>
      </div>
      <div className={`${s.frag} ${s.version} ${s.extra} ${s.faded}`} data-link>
        <span className={`${s.av} ${s.rafi}`}>R</span>
        <span><b>Before the demo</b><small>Version 12 · Rafi · 2 h ago</small></span>
        <span className={s.vtag}>Named</span>
      </div>
      <span className={`${s.frag} ${s.pill}`} data-link>Published</span>
      <Cursor cls={s.ayesha} name="Ayesha" />
      <Cursor cls={`${s.rafi} ${s.wide} ${s.half}`} name="Rafi" />
    </div>
  )
}
