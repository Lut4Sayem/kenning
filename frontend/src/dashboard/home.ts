export type GroupLabel = 'Today' | 'Yesterday' | 'Earlier'

/** Before 12:00 morning, before 17:00 afternoon, else evening (the user's local hour). */
export const greetingFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')

/** "Sunday, 15 November": built from parts so no locale adds or drops the comma. */
export function longDate(d: Date): string {
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o)
  return `${part({ weekday: 'long' })}, ${d.getDate()} ${part({ month: 'long' })}`
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Local calendar days (not 24-hour windows), keeping the input order; empty groups are left out. */
export function groupByDay<T>(items: T[], when: (t: T) => string | null | undefined, now = new Date()): { label: GroupLabel; items: T[] }[] {
  const today = dayStart(now)
  const yesterday = dayStart(new Date(today - 1))
  const groups: Record<GroupLabel, T[]> = { Today: [], Yesterday: [], Earlier: [] }
  for (const it of items) {
    const w = when(it)
    const t = w ? dayStart(new Date(w)) : 0
    groups[t >= today ? 'Today' : t >= yesterday ? 'Yesterday' : 'Earlier'].push(it)
  }
  return (['Today', 'Yesterday', 'Earlier'] as const).filter((l) => groups[l].length).map((label) => ({ label, items: groups[label] }))
}

/** "Team · Space", or "Private" for my personal space. */
export const locationOf = (teamName: string | null | undefined, spaceName: string | null | undefined) =>
  teamName == null ? 'Private' : spaceName ? `${teamName} · ${spaceName}` : teamName
