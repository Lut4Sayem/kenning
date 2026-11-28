import s from './Board.module.css'

/** Shown while this user's view follows someone (WB 7.6). */
export default function FollowChip({ name, onStop }: { name: string; onStop: () => void }) {
  return (
    <p className={s.follow} role="status">
      Following {name} · <button type="button" onClick={onStop}>Stop</button>
    </p>
  )
}
