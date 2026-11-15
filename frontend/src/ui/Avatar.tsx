import { initialsOf, tintOf } from './tint'
import s from './Avatar.module.css'

/** Initials on a tint picked by the person's name (DESIGN.md section 6). `me` uses the accent colours instead. */
export default function Avatar({ name, size = 24, me, className }: { name: string; size?: number; me?: boolean; className?: string }) {
  const tint = tintOf(name || '?')
  return (
    <span
      className={`${s.avatar} ${me ? s.me : ''} ${className ?? ''}`}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size < 24 ? 10 : 11, ...(me ? {} : { background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)` }) }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Overlapping avatars, 24px with a white 2px ring and -5px overlap. */
export function AvatarStack({ names }: { names: string[] }) {
  return <span className={s.stack} aria-hidden="true">{names.map((n, i) => <Avatar key={i} name={n} className={s.ring} />)}</span>
}
