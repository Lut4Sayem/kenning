import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { MySpace } from '../api/spaces'
import { getTeam, leaveTeam } from '../api/teams'
import { confirmDialog } from '../ui/ConfirmDialog'
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

/**
 * QA-68: Leave team from the sidebar team menu or the Overview danger zone. The last admin is told what to do
 * instead of being asked (the server refuses it too); everyone else confirms first.
 */
export function useLeaveTeam() {
  const qc = useQueryClient()
  const gone = useTeamGone()
  return async (teamId: string, name: string, role: string) => {
    try {
      if (role === 'ADMIN') {
        const team = await qc.fetchQuery({ queryKey: ['team', teamId], queryFn: () => getTeam(teamId) })
        if (team.teamMembers.filter((m) => m.role === 'ADMIN').length < 2) {
          toast('Make someone else an admin or delete the team first.', 'error')
          return
        }
      }
      const yes = await confirmDialog({
        title: `Leave ${name}?`,
        body: 'You lose access to its spaces and pages. Pages you wrote stay in the team. To come back, an admin has to let you in again.',
        confirmLabel: 'Leave team',
        danger: true,
      })
      if (!yes) return
      await leaveTeam(teamId)
      await gone(teamId, `You left ${name}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not leave the team', 'error')
    }
  }
}
