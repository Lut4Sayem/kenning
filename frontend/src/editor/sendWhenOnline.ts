import { useEffect } from 'react'
import { pendingPages } from './pendingStore'

/** QA-40: copies of pages left while offline are sent when the app starts and whenever the connection comes back. */
export function useSendPendingWhenOnline(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    const send = async () => {
      if (!(await pendingPages(userId)).nodes.length) return // the sender pulls in the editor code: only load it with work to do
      const { sendAllPending } = await import('./logout')
      await sendAllPending(userId, { skipLive: true })
    }
    const run = () => void send().catch(() => {}) // what could not be sent stays on the device for the next try
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [userId])
}
