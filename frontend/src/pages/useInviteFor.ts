import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Preview } from './Join'

/** The team a ?next= invite link is for, so login and register can name it (QA-04). null while loading or if the link is broken. */
export function useInviteFor(next: string | null): Preview | null {
  const code = next?.match(/^\/app\/join\/([^/?#]+)/)?.[1] ?? null
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    if (!code) return
    let live = true
    api<Preview>(`/api/team-invites/${code}`, { redirectOn401: false }).then((p) => { if (live) setPreview(p) }, () => {})
    return () => { live = false }
  }, [code])
  return code ? preview : null
}
