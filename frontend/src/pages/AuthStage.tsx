// Decorative background for login, register and join: a dot grid, six app fragments joined to the form card by thin
// curves, and two named cursors. aria-hidden and never focusable; CSS decides what shows at each width.
import { useEffect, useRef, useState, type RefObject } from 'react'
import s from './AuthStage.module.css'

type Line = { d: string; a: [number, number]; b: [number, number] }

/** A curve from each linked fragment's inner edge to the form card, redrawn when either one resizes. */
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
        const b: [number, number] = [left ? f.left - st.left - 10 : f.right - st.left + 10, Math.min(Math.max(a[1], f.top - st.top + 48), f.bottom - st.top - 48)]
        const k = (b[0] - a[0]) * 0.55
        out.push({ d: `M${a[0]} ${a[1]} C${a[0] + k} ${a[1]} ${b[0] - k} ${b[1]} ${b[0]} ${b[1]}`, a, b })
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
          <g key={l.d}><path d={l.d} /><circle cx={l.a[0]} cy={l.a[1]} r="3" /><circle cx={l.b[0]} cy={l.b[1]} r="3" /></g>
        ))}
      </svg>
      <div className={`${s.frag} ${s.card} ${s.wide}`} data-link>
        <p className={s.title}><span className={s.dot} />API design notes</p>
        <p className={s.meta}>Backend · edited 2 min ago</p>
        <div className={s.tags}><span className={s.tag}>spring</span><span className={s.tag}>auth</span></div>
      </div>
      <div className={`${s.frag} ${s.note} ${s.extra}`} data-link>
        <p className={s.title}>Weekly sync, 14 Nov</p>
        <p className={`${s.todo} ${s.done}`}><span className={s.box}><Check /></span><span>Split the schema task</span></p>
        <p className={s.todo}><span className={s.box} /><span>Ayesha: review PR #44</span></p>
        <p className={s.todo}><span className={s.box} /><span>Rafi: write the demo script</span></p>
      </div>
      <div className={`${s.frag} ${s.code} ${s.extra}`} data-link>{'POST '}<b>/api/nodes/7f3a/publish</b>{'\n200 { "status": "PUBLISHED" }'}</div>
      <div className={`${s.frag} ${s.files} ${s.extra}`} data-link>
        <p className={s.title}>Files</p>
        <p className={s.row}><span className={s.ficon}>PNG</span><span>er-diagram.png</span><small>240 KB</small></p>
        <p className={s.row}><span className={`${s.ficon} ${s.pdf}`}>PDF</span><span>demo-slides.pdf</span><small>1.8 MB</small></p>
      </div>
      <div className={`${s.frag} ${s.version} ${s.extra}`} data-link>
        <span className={`${s.av} ${s.rafi}`}>R</span>
        <span><b>Before the demo</b><small>Version 12 · Rafi · 2 h ago</small></span>
        <span className={s.vtag}>Named</span>
      </div>
      <span className={`${s.frag} ${s.pill}`} data-link>Published</span>
      <Cursor cls={s.ayesha} name="Ayesha" />
      <Cursor cls={`${s.rafi} ${s.wide}`} name="Rafi" />
    </div>
  )
}
