import s from './RolePill.module.css'

const LABEL: Record<string, string> = { ADMIN: 'Admin', EDITOR: 'Editor', VIEWER: 'Viewer' }

/** Admin lavender, Editor sky, Viewer gray (DESIGN.md section 2). The word is always there: colour is never the only signal. */
export default function RolePill({ role }: { role: string }) {
  return <span className={`${s.pill} ${s[role] ?? s.VIEWER}`}>{LABEL[role] ?? role}</span>
}

export const roleLabel = (role: string) => LABEL[role] ?? role
