import { api } from './client'

export interface SearchHit {
  /** Spaces and teams matched by name carry no nodeId; they have no page of their own in the app yet. */
  type: 'PAGE' | 'SPACE' | 'TEAM'
  nodeId: string | null
  teamId: string | null
  spaceId: string | null
  spaceName: string | null
  title: string
  path: string
  /** Server-escaped text with only <mark> added. */
  snippetHtml: string
  tags: string[]
  publishState: 'DRAFT' | 'PUBLISHED' | null
  archived: boolean
  /** null = a page in my personal space. */
  teamName?: string | null
  /** Only on /api/me/recent: when I last opened the page. */
  openedAt?: string | null
  /** Pages only: when and by whom the page was last edited. */
  updatedAt?: string | null
  updatedByName?: string | null
}

export interface SearchParams {
  q?: string
  tag?: string
  publishState?: string
  limit?: number
}

export const searchAll = (p: SearchParams) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') u.set(k, String(v))
  return api<SearchHit[]>(`/api/search?${u}`)
}

export const getRecent = () => api<SearchHit[]>('/api/me/recent')
