import { api } from './client'

/** A short-lived pass to the page's live session. access is what this user may do there right now. */
export interface Ticket {
  ticket: string
  access: 'EDIT' | 'VIEW'
  epoch: number
}

export const getTicket = (nodeId: string) => api<Ticket>(`/api/nodes/${nodeId}/collab-ticket`, { method: 'POST' })
