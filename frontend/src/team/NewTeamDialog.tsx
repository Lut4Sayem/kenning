import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createTeam } from '../api/teams'
import FormDialog from '../ui/FormDialog'

/** "New team" from the sidebar: creates the team, refreshes what lists teams, opens the new team. */
export default function NewTeamDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const nav = useNavigate()

  async function submit(name: string) {
    const team = await createTeam(name, '')
    await Promise.all(['teams', 'my-teams', 'spaces'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    onClose()
    nav(`/teams/${team.id}`)
  }

  return <FormDialog title="New team" label="Team name" submitLabel="Create team" onSubmit={submit} onClose={onClose} />
}
