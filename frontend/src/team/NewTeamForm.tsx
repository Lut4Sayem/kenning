import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTeam } from '../api/teams'

/** Creates a team and opens it. Home no longer has this form (DP-3); until the team screens are redone it lives on Profile. */
export default function NewTeamForm() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const make = useMutation({
    mutationFn: () => createTeam(name.trim(), ''),
    onSuccess: async (t) => {
      // the sidebar's team picker and project list come from these
      await Promise.all(['teams', 'my-teams', 'spaces'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
      nav(`/teams/${t.id}`)
    },
  })

  if (!creating) return <button type="button" onClick={() => setCreating(true)}>New team</button>
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) make.mutate() }}>
      <label>Team name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
      {!name.trim() && <p className="page-note">Give the team a name.</p>}
      <button type="submit" disabled={!name.trim() || make.isPending}>Create a team</button>
      <button type="button" onClick={() => setCreating(false)}>Cancel</button>
      {make.error && <p role="alert">{make.error.message}</p>}
    </form>
  )
}
