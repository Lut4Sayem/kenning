import { api } from './client'

export interface MySpace {
  id: string
  name: string
  icon: string | null
  ownerType: 'TEAM' | 'USER'
  teamId: string | null
  teamName: string | null
  myRole: string | null
}

export interface MyTeam {
  teamId: string
  teamName: string
  role: string
}

export interface Me {
  id: string
  fullName: string | null // accounts made before names were required can have none (QA-50)
  email: string
  profilePicture?: string | null
}

/** Viewers can read a team space but not add, move or edit pages in it; the private space is always the owner's (QA-37). */
export const canEditSpace = (s: MySpace) => s.ownerType === 'USER' || s.myRole === 'ADMIN' || s.myRole === 'EDITOR'

export const getMySpaces = () => api<MySpace[]>('/api/me/spaces')
export const getMyTeams = () => api<MyTeam[]>('/api/me/teams')
export const getMe = () => api<Me>('/api/me')
