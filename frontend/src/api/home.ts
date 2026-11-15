import { api } from './client'

export interface Draft {
  nodeId: string
  title: string
  spaceId: string
  spaceName: string
  /** null = a page in my personal space */
  teamName: string | null
  updatedAt: string
}

export const getDrafts = (limit = 5) => api<{ items: Draft[]; total: number }>(`/api/me/drafts?limit=${limit}`)
