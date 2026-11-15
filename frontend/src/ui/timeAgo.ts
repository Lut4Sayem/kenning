export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hours ago`
  const days = Math.round(mins / (24 * 60))
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** "just now", "5m ago", "2h ago", "yesterday", "3d ago"; a date after a month. For cards. */
export function timeShort(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`
  const days = Math.floor(mins / (24 * 60))
  if (days === 1) return 'yesterday'
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** The same without "ago", for list rows: "now", "5m", "2h", "3d". */
export const timeCompact = (iso: string | null, now = Date.now()) =>
  timeShort(iso, now).replace(' ago', '').replace('just now', 'now').replace('yesterday', '1d')
