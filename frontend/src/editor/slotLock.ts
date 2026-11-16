// Which pending slots belong to a tab that is still alive? Each editing session holds a Web Lock named
// after its slot for as long as it lives; the browser releases it when the tab closes or crashes.
// Without Web Locks (old browsers, plain http) nothing is ever "held": every stored slot counts as orphaned.
const locks = () => (typeof navigator === 'undefined' ? undefined : navigator.locks)

/** Resolves once the lock is held, with the function that releases it. */
export function holdSlot(name: string): Promise<() => void> {
  const manager = locks()
  if (!manager) return Promise.resolve(() => {})
  return new Promise((resolve) => {
    let release!: () => void
    const untilReleased = new Promise<void>((r) => (release = r))
    manager
      .request(name, () => {
        resolve(release)
        return untilReleased
      })
      .catch(() => resolve(() => {}))
  })
}

// query(), not request(ifAvailable): probing by taking the lock would make a second probe running at the
// same moment see it as held (QA-40: two opens of one page, the copy was skipped by both).
export async function isHeld(name: string): Promise<boolean> {
  const manager = locks()
  if (!manager) return false
  try {
    return ((await manager.query()).held ?? []).some((lock) => lock.name === name)
  } catch {
    return false
  }
}
