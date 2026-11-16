import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import s from './States.module.css'

/** Placeholder for a screen whose code or data is still on its way: a title bar and a few rows, no spinner. */
export function ScreenSkeleton({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className={s.wrap} aria-busy="true" aria-label={label} role="status">
      <span className={`${s.skel} ${s.title}`} />
      {Array.from({ length: rows }, (_, i) => <span key={i} className={`${s.skel} ${s.row}`} />)}
    </div>
  )
}

/** A whole-screen empty or error state: what happened, one line on what to do, one action. */
export function ScreenMessage({ title, children, action, alert }: { title: string; children?: ReactNode; action?: ReactNode; alert?: boolean }) {
  return (
    <div className={s.message} role={alert ? 'alert' : undefined}>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export const ActionLink = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to} className={s.action}>{children}</Link>
export const ActionButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className={s.action} onClick={onClick}>{children}</button>
)

export function NotFound() {
  return (
    <ScreenMessage title="This page doesn’t exist" action={<ActionLink to="/">Go to Home</ActionLink>}>
      The link may be old, or the page was moved.
    </ScreenMessage>
  )
}
