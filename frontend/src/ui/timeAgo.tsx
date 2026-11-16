/**
 * The one time format of the app: "just now", "5 min ago", "2 h ago", "yesterday", then "12 Nov"
 * ("30 Dec 2025" in another year). `<Time>` shows it with the full date and time as a tooltip.
 */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`
  if (mins < 48 * 60) return 'yesterday'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() && { year: 'numeric' }) })
}

/** "12 Nov 2026, 08:05" in the reader's time zone. */
export const fullDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export default function Time({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return null
  return <time className={className} dateTime={iso} title={fullDate(iso)}>{timeAgo(iso)}</time>
}
