import { api } from './client'

export interface NodeSummary {
  id: string
  parentId: string | null
  rank: string
  title: string
  icon: string | null
  type: 'PAGE' | 'BOARD'
  publishState: 'DRAFT' | 'PUBLISHED'
  locked: boolean
  titleOnly: boolean
}

export interface NodeDetail {
  id: string
  spaceId: string
  parentId: string | null
  title: string
  icon: string | null
  tags: string[]
  publishState: 'DRAFT' | 'PUBLISHED'
  locked: boolean
  lockedBy: string | null
  status: 'ACTIVE' | 'ARCHIVED' | 'TRASHED'
  access: 'NONE' | 'TITLE_ONLY' | 'VIEW' | 'EDIT'
  /** A page editor even if the page is locked or archived: shows the lock/archive/trash menu. */
  canManage: boolean
  breadcrumbs: { id: string; title: string }[]
  createdBy: { id: string; name: string; avatarUrl: string | null } | null
  updatedBy: { id: string; name: string; avatarUrl: string | null } | null
  contentUpdatedAt: string
}

export interface MoveBody {
  parentId: string | null
  beforeId?: string
  afterId?: string
  /** Another space of the same team (QA-12); left out = stay in the page's space. */
  spaceId?: string
}

export const getTree = (spaceId: string) => api<NodeSummary[]>(`/api/spaces/${spaceId}/tree`)

export const createNode = (spaceId: string, body: { parentId?: string | null; title?: string; afterId?: string }) =>
  api<NodeDetail>(`/api/spaces/${spaceId}/nodes`, { method: 'POST', body: JSON.stringify(body) })

export const getNode = (id: string) => api<NodeDetail>(`/api/nodes/${id}`)

export const updateNode = (id: string, body: { title?: string; icon?: string; tags?: string[] }) =>
  api<NodeDetail>(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const moveNode = (id: string, body: MoveBody) =>
  api<NodeDetail>(`/api/nodes/${id}/move`, { method: 'POST', body: JSON.stringify(body) })

export const moveToTeam = (id: string, body: { spaceId: string } & MoveBody) =>
  api<NodeDetail>(`/api/nodes/${id}/move-to-team`, { method: 'POST', body: JSON.stringify(body) })

// ---------- publish, lock, tags ----------
const post = <T,>(path: string) => api<T>(path, { method: 'POST' })

export const publishNode = (id: string) => post<NodeDetail>(`/api/nodes/${id}/publish`)
export const unpublishNode = (id: string) => post<NodeDetail>(`/api/nodes/${id}/unpublish`)
export const lockNode = (id: string) => post<NodeDetail>(`/api/nodes/${id}/lock`)
export const unlockNode = (id: string) => post<NodeDetail>(`/api/nodes/${id}/unlock`)

export interface TaggedNode {
  id: string
  spaceId: string
  spaceName: string
  title: string
  icon: string | null
  tags: string[]
  publishState: 'DRAFT' | 'PUBLISHED'
}
export const getTagged = (tag: string) => api<TaggedNode[]>(`/api/tags/${encodeURIComponent(tag)}/nodes`)

// ---------- trash and archive ----------
export interface Branch {
  id: string
  title: string
  icon: string | null
  path: { id: string; title: string }[]
  descendantCount: number
  by: { id: string; name: string } | null
  at: string | null
  /** null for archived branches */
  purgeAt: string | null
  /** the parent is gone or not active: a restore lands at the top level */
  parentGone: boolean
  canRestore: boolean
}
export interface BranchList {
  canPurge: boolean
  items: Branch[]
}

export const getSubtreeCount = (id: string) => api<{ count: number }>(`/api/nodes/${id}/subtree-count`)
export const trashNode = (id: string) => post<{ count: number }>(`/api/nodes/${id}/trash`)
export const archiveNode = (id: string) => post<{ count: number }>(`/api/nodes/${id}/archive`)
export const unarchiveNode = (id: string) => post<{ movedToTop: boolean }>(`/api/nodes/${id}/unarchive`)
/** Where a trashed page went (QA-33); 404 unless it is trashed and I could see it otherwise. */
export interface Trashed {
  rootId: string
  rootTitle: string
  spaceId: string
  by: { id: string; name: string } | null
  at: string | null
  canRestore: boolean
}
export const getTrashed = (id: string) => api<Trashed>(`/api/nodes/${id}/trashed`)
export const getTrash = (spaceId: string) => api<BranchList>(`/api/spaces/${spaceId}/trash`)
export const getArchived = (spaceId: string) => api<BranchList>(`/api/spaces/${spaceId}/archived`)
/** QA-34: one space's branches in the team trash; only spaces with something in them. */
export interface SpaceBranches extends BranchList {
  spaceId: string
  spaceName: string
}
export const getTeamTrash = (teamId: string) => api<SpaceBranches[]>(`/api/teams/${teamId}/trash`)
export const getTeamArchived = (teamId: string) => api<SpaceBranches[]>(`/api/teams/${teamId}/archived`)
export const restoreBranch = (rootId: string) => post<{ movedToTop: boolean }>(`/api/trash/${rootId}/restore`)
export const deleteForever = (rootId: string) => api<null>(`/api/trash/${rootId}`, { method: 'DELETE' })
