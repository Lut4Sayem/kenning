import { api } from './client'

export interface DashTeam { teamId: string; name: string; description: string | null; role: string; spaceCount: number; documentCount: number }
export interface DashPage { documentId: string; title: string; status: string; updatedAt: string; teamName: string; spaceName: string }
export interface DashActivity { id: string; teamName: string; action: string; targetTitle: string | null; createdAt: string; actorFullName: string | null; actorEmail: string | null }
export interface Dashboard { teamCount: number; spaceCount: number; documentCount: number; teams: DashTeam[]; recentDocuments: DashPage[]; recentActivity: DashActivity[] }
export interface Member { userId: string; fullName: string; email: string; role: string }
export interface TeamDetail { team: { id: string; name: string; description: string | null }; teamMembers: Member[] }
export interface JoinRequest { id: string; fullName: string; email: string; status: string; requestedAt: string }
export interface TeamSpace { id: string; name: string; description: string | null; icon?: string | null; pageCount: number; draftCount: number }
export interface TeamSummary {
  name: string; description: string | null; memberCount: number; spaceCount: number; pageCount: number; myRole: string
  updatedAt: string | null; firstMembers: { userId: string; fullName: string; role: string }[]
}
export interface TeamPageItem {
  id: string; title: string; spaceId: string; spaceName: string; publishState: 'DRAFT' | 'PUBLISHED' | null
  lastEditorName: string | null; lastEditorId: string | null; updatedAt: string; parentTitle: string | null
}
export interface TeamPages { items: TeamPageItem[]; total: number }
export interface TeamActivity { actorName: string | null; action: string; targetTitle: string; targetId: string; createdAt: string }
export interface TeamPagesQuery { status?: string; spaceId?: string; editedBy?: string; sort?: string; page?: number; size?: number }

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const getDashboard = () => api<Dashboard>('/api/dashboard')
export const createTeam = (teamName: string, teamDescription: string) => api<{ id: string }>('/api/teams', json('POST', { teamName, teamDescription }))
export const getTeam = (id: string) => api<TeamDetail>(`/api/teams/${id}`)
export const getTeamSpaces = (id: string) => api<TeamSpace[]>(`/api/teams/${id}/spaces`)
export const createTeamSpace = (id: string, name: string, description: string) => api<TeamSpace>(`/api/teams/${id}/spaces`, json('POST', { name, description }))
export const setRole = (id: string, userId: string, role: string) => api(`/api/teams/${id}/members/${userId}/role`, json('PUT', { role }))
export const removeMember = (id: string, userId: string) => api(`/api/teams/${id}/members/${userId}`, json('DELETE'))
export interface InviteLink { inviteCode: string; createdAt: string | null; createdByName: string | null }
/** The team's one invite link (admins); null when it has none (204). */
export const getInvite = (id: string) => api<InviteLink | null>(`/api/teams/${id}/invite`)
export const createInvite = (id: string) => api<InviteLink>(`/api/teams/${id}/invite`, json('POST'))
export const turnOffInvite = (id: string) => api(`/api/teams/${id}/invite`, json('DELETE'))
export const getJoinRequests = (id: string) => api<JoinRequest[]>(`/api/teams/${id}/join-requests`)
/** reopen = undo a decline (QA-06). role on accept: VIEWER or EDITOR (QA-09). */
export const answerJoinRequest = (id: string, rid: string, action: 'accept' | 'reject' | 'reopen', role?: 'VIEWER' | 'EDITOR') =>
  api(`/api/teams/${id}/join-requests/${rid}/${action}`, json('POST', role && { role }))
export const getTeamSummary = (id: string) => api<TeamSummary>(`/api/teams/${id}/summary`)
export const getTeamPages = (id: string, q: TeamPagesQuery) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') u.set(k, String(v))
  return api<TeamPages>(`/api/teams/${id}/pages?${u}`)
}
export const getTeamActivity = (id: string, limit = 5) => api<TeamActivity[]>(`/api/teams/${id}/activity?limit=${limit}`)
