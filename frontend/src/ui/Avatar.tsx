import { initialsOf, tintOf } from './tint'
import s from './Avatar.module.css'

/**
 * Initials on a tint picked by the person's name (DESIGN.md section 6). `me` uses the accent colours instead;
 * `color` (live presence) is the person's cursor colour with white initials.
 */
export default function Avatar({ name, size = 24, me, color, className }: { name: string | null; size?: number; me?: boolean; color?: string; className?: string }) {
  const tint = tintOf(name || '?')
  const look = color ? { background: color, color: '#fff' } : me ? {} : { background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)` }
  return (
    <span
      className={`${s.avatar} ${me ? s.me : ''} ${className ?? ''}`}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size < 24 ? 10 : 11, ...look }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Overlapping avatars, 24px with a white 2px ring and -5px overlap. */
export function AvatarStack({ names }: { names: (string | null)[] }) {
  return <span className={s.stack} aria-hidden="true">{names.map((n, i) => <Avatar key={i} name={n} className={s.ring} />)}</span>
}
