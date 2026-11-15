import { initialOf, tintOf } from './tint'

/** The team's initial on a tint chosen by a hash of its name. */
export default function TeamTile({ name, size = 18 }: { name: string; size?: number }) {
  const tint = tintOf(name || '?')
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid', placeItems: 'center', flex: 'none', width: size, height: size, borderRadius: size > 24 ? 8 : 5,
        fontSize: size > 24 ? 13 : 11, fontWeight: 700, background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)`,
      }}
    >
      {initialOf(name)}
    </span>
  )
}
