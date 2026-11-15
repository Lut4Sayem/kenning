import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getMe } from '../api/spaces'
import { safeNext } from './safeNext'

/** /app/logout: the one way out, also used by the old pages, so unsaved local copies are always sent first. */
export default function Logout() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const raw = useSearchParams()[0].get('next')
  const next = raw ? safeNext(raw) : undefined

  useEffect(() => {
    let live = true
    getMe().then(
      (me) => import('../editor/logout').then((m) => m.logOut(me.id, next)).then((left) => !left && live && (next ? location.assign(next) : navigate('/'))), // "no, stay"
      (e) => (e instanceof ApiError ? location.assign('/app/login') : live && setFailed(true)),
    )
    return () => {
      live = false
    }
  }, [navigate, next])

  return <p style={{ padding: 'var(--space-8)' }} role="status">{failed ? 'Could not log out. Check your connection and try again.' : 'Logging out…'}</p>
}
