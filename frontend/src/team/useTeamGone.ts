import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { MySpace } from '../api/spaces'
import { toast } from '../ui/Toast'

/**
 * After a team is deleted or left (QA-67, QA-68): go Home, say so, and drop the team from every cache, so the sidebar,
 * Ctrl+K, Home and the recent cards no longer show it, without a reload.
 */
export function useTeamGone() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return async (teamId: string, message: string) => {
    const spaceIds = (qc.getQueryData<MySpace[]>(['spaces']) ?? []).filter((sp) => sp.teamId === teamId).map((sp) => sp.id)
    navigate('/')
    toast(message)
    await Promise.all(['teams', 'spaces', 'home', 'recent'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    // after Home has replaced the team screen, so nothing refetches the team that is gone
    for (const k of ['team-summary', 'team-spaces', 'team-pages', 'team', 'join-requests', 'team-activity']) qc.removeQueries({ queryKey: [k, teamId] })
    for (const id of spaceIds) qc.removeQueries({ queryKey: ['tree', id] })
  }
}
