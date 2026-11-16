// Release 1a only (domain spec 5.4): one editor at a time, by courtesy. Real-time editing replaces this in 1b.
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { acquireEditLock, releaseEditLock } from '../api/content'
import Avatar from '../ui/Avatar'
import b from './SoftLock.module.css'

/**
 * checking: asking the server · editing: I hold the lock · blocked: someone else does (banner up) ·
 * taken: I was editing and someone chose "Edit anyway" (QA-27) · readonly: I chose to only read ·
 * denied: the server says I may not edit this page any more
 */
export type LockMode = 'checking' | 'editing' | 'blocked' | 'taken' | 'readonly' | 'denied'

const HEARTBEAT_MS = 20_000 // the server lets a lock expire 60 s after the last call; also how often the banner re-checks

export function useEditLock(nodeId: string, canEdit: boolean) {
  const [mode, setMode] = useState<LockMode>('checking')
  const [holder, setHolder] = useState('Someone')
  const [reason, setReason] = useState('') // the server's words when mode is 'denied'
  const acquire = useRef<(force: boolean) => void>(() => {})
  const stopWaiting = useRef(() => {})

  useEffect(() => {
    if (!canEdit) return
    let live = true
    let mine = false
    let waiting = false // banner is up: keep asking, so it goes away when the other person leaves
    stopWaiting.current = () => (waiting = false)
    acquire.current = (force) => {
      acquireEditLock(nodeId, force).then(
        (lock) => {
          if (!live) return
          const takenFromMe = mine && !lock.mine
          mine = lock.mine
          // Taken over: no quiet grab back when it frees up; the person chooses Reload or Take back.
          waiting = !lock.mine && !takenFromMe
          if (lock.holder && !lock.mine) setHolder(lock.holder.name)
          setMode((m) => (lock.mine ? 'editing' : takenFromMe ? 'taken' : m === 'readonly' || m === 'taken' ? m : 'blocked'))
        },
        (e) => {
          if (!live) return
          if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
            // Locked, permission removed or page gone: typing on would only pile up changes that cannot be saved.
            mine = waiting = false
            setReason(e.message)
            setMode('denied')
            return
          }
          // shortcut: if the lock can't be checked (network) we let the user edit; the revision check on
          // save still stops silent overwrites. Revisit only if the soft lock outlives 1b.
          setMode((m) => (m === 'checking' ? 'editing' : m))
        },
      )
    }
    const release = (keepalive: boolean) => {
      if (mine) void releaseEditLock(nodeId, keepalive).catch(() => {})
    }
    const onPageHide = () => release(true)

    acquire.current(false)
    const heartbeat = setInterval(() => (mine || waiting) && acquire.current(false), HEARTBEAT_MS)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      live = false
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', onPageHide)
      release(false)
    }
  }, [nodeId, canEdit])

  return {
    mode,
    holder,
    reason,
    editAnyway: () => acquire.current(true),
    openReadOnly: () => {
      stopWaiting.current() // a reader does not take the lock when it becomes free
      setMode('readonly')
    },
  }
}

interface Props {
  holder: string
  onReadOnly: () => void
  onEditAnyway: () => void
}

export default function SoftLockBanner({ holder, onReadOnly, onEditAnyway }: Props) {
  return (
    <div role="status" className={b.banner}>
      <span className={b.who}><Avatar name={holder} size={28} /><span className={b.live} aria-hidden="true" /></span>
      <span className={b.text}><strong>{holder}</strong> is editing right now.</span>
      <button type="button" className={b.open} onClick={onReadOnly}>Open read-only</button>
      <button type="button" className={b.anyway} onClick={onEditAnyway}>Edit anyway</button>
    </div>
  )
}

/** QA-27: shown to the person who was editing when someone else chose "Edit anyway". */
export function TakenOverBanner({ holder, saved, onReload, onTakeBack }: { holder: string; saved: boolean; onReload: () => void; onTakeBack: () => void }) {
  return (
    <div role="status" className={b.banner}>
      <span className={b.who}><Avatar name={holder} size={28} /><span className={b.live} aria-hidden="true" /></span>
      <span className={b.text}>
        <strong>{holder}</strong> started editing too. Your view is now read-only; {saved ? 'your last changes were saved.' : 'saving your last changes…'}
      </span>
      <button type="button" className={b.open} onClick={onReload}>Reload</button>
      <button type="button" className={b.anyway} onClick={onTakeBack}>Take back</button>
    </div>
  )
}
