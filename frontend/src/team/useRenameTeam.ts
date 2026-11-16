import { useQueryClient } from '@tanstack/react-query'
import { updateTeam } from '../api/teams'
import { toast } from '../ui/Toast'

/**
 * QA-63: renames a team (admins only; the server checks). Every cache that shows the team name is refreshed, so the
 * sidebar, breadcrumbs, team tabs and Ctrl+K show the new name without a reload. Rejects with the server's message.
 */
export function useRenameTeam(teamId: string) {
  const qc = useQueryClient()
  return async (name: string) => {
    const team = await updateTeam(teamId, { teamName: name.trim() })
    await Promise.all(['team-summary', 'team', 'teams', 'spaces', 'team-activity', 'home'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    toast(`Renamed to ${team.name}`)
  }
}
