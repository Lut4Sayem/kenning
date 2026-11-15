import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { getMe, getMyTeams, type Me } from '../api/spaces'
import { TopBar } from '../app/ShellSlots'
import Icon from '../ui/Icon'
import RolePill from '../ui/RolePill'
import TeamTile from '../ui/TeamTile'
import { initialsOf } from '../ui/tint'
import s from './Profile.module.css'

const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX = 2 * 1024 * 1024

/** /app/profile: name, picture and the teams I'm in (mockup profile). */
export default function Profile() {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const teams = useQuery({ queryKey: ['my-teams'], queryFn: getMyTeams })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => setName(me.data?.fullName ?? ''), [me.data?.fullName])

  const done = (u: Me) => { qc.setQueryData(['me'], u); setError('') }
  const fail = (e: Error) => setError(e.message)
  const save = useMutation({
    mutationFn: () => api<Me>('/api/me', { method: 'PUT', body: JSON.stringify({ fullName: name.trim() }) }),
    onSuccess: (u) => { done(u); setSaved(true) }, onError: fail,
  })
  const upload = useMutation({
    mutationFn: (f: File) => { const b = new FormData(); b.append('file', f); return api<Me>('/api/me/picture', { method: 'POST', body: b }) },
    onSuccess: done, onError: fail,
  })
  const remove = useMutation({ mutationFn: () => api<Me>('/api/me/picture', { method: 'DELETE' }), onSuccess: done, onError: fail })

  function pick(f: File | undefined) {
    if (!f) return
    if (!TYPES.includes(f.type)) return setError('Use a PNG, JPG, GIF or WebP image.')
    if (f.size > MAX) return setError('The limit is 2 MB.')
    upload.mutate(f)
  }

  const top = (
    <TopBar>
      <nav className={s.crumbs} aria-label="Breadcrumb"><span className={s.here}><Icon name="user" />Profile</span></nav>
    </TopBar>
  )
  if (!me.data) {
    return (
      <div className={s.wrap} data-bleed>
        {top}
        <h1>Profile</h1>
        {me.isError
          ? <p className={s.error} role="alert">Could not load your profile. <button type="button" onClick={() => void me.refetch()}>Try again</button></p>
          : <div className={s.grid} aria-busy="true" aria-label="Loading"><div className={`${s.card} ${s.skel}`} /><div className={`${s.card} ${s.skel}`} /></div>}
      </div>
    )
  }
  const dirty = name.trim() !== me.data.fullName
  const busyPicture = upload.isPending || remove.isPending

  return (
    <div className={s.wrap} data-bleed>
      {top}
      <h1>Profile</h1>
      <div className={s.grid}>
        <section className={s.card} aria-labelledby="you">
          <h2 id="you" className={s.cardTitle}>You</h2>
          <div className={s.pictureRow}>
            <span className={s.avatar}>
              {me.data.profilePicture
                ? <img src={`/api/users/${me.data.id}/picture?v=${encodeURIComponent(me.data.profilePicture)}`} alt="Your profile picture" width={88} height={88} />
                : <span aria-hidden="true">{initialsOf(me.data.fullName)}</span>}
              <button type="button" className={s.cam} aria-label="Change picture" title="Change picture" disabled={busyPicture} onClick={() => file.current?.click()}>
                <Icon name="camera" size={14} />
              </button>
            </span>
            <span className={s.pictureSide}>
              <span className={s.hint}>PNG, JPG, GIF or WebP, up to 2 MB. Teammates see it on pages and comments.</span>
              <span className={s.pictureActions}>
                <button type="button" className={s.white} disabled={busyPicture} onClick={() => file.current?.click()}>{upload.isPending ? 'Uploading…' : 'Upload picture'}</button>
                {me.data.profilePicture && <button type="button" className={s.danger} aria-label="Remove picture" disabled={busyPicture} onClick={() => remove.mutate()}>Remove</button>}
              </span>
            </span>
            <input ref={file} type="file" className="sr-only" tabIndex={-1} accept={TYPES.join(',')} aria-label="Profile picture" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {error && <p role="alert" className={s.error}>{error}</p>}
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate() }}>
            <label className={s.field}>
              <span className={s.label}>Name</span>
              <input className={s.input} value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} maxLength={100} autoComplete="name"
                aria-invalid={!name.trim()} aria-describedby={!name.trim() ? 'name-help' : undefined} />
            </label>
            {!name.trim() && <p id="name-help" className={s.help}>Enter your name. Teammates see it on pages and comments.</p>}
            <label className={s.field}>
              <span className={s.label}>Email</span>
              <input className={`${s.input} ${s.readonly}`} value={me.data.email} readOnly />
            </label>
            <div className={s.saveRow}>
              <span className={s.help} role="status">{dirty ? 'Unsaved changes' : saved ? 'Saved' : ''}</span>
              <button type="submit" className={s.primary} disabled={!name.trim() || !dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </section>

        <section className={s.card} aria-labelledby="my-teams">
          <h2 id="my-teams" className={s.cardTitle}>My teams</h2>
          {teams.isPending ? <div className={s.teamSkel} aria-busy="true" aria-label="Loading teams" />
            : teams.isError ? <p className={s.error} role="alert">Could not load your teams. <button type="button" onClick={() => void teams.refetch()}>Try again</button></p>
              : teams.data.length === 0 ? <p className={s.help}>You are not in a team yet. Use the + next to Your teams in the sidebar to start one.</p>
                : (
                  <ul className={s.teams}>
                    {teams.data.map((t) => (
                      <li key={t.teamId}>
                        <Link to={`/teams/${t.teamId}`} className={s.teamRow}>
                          <TeamTile name={t.teamName} size={28} />
                          <span className={s.teamName}>{t.teamName}</span>
                          <RolePill role={t.role} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
        </section>
      </div>
    </div>
  )
}
