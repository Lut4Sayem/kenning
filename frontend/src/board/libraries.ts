// Shape packs served from our own origin (licences in public/board-libraries/NOTICE), never libraries.excalidraw.com.
import { loadLibraryFromBlob } from '@excalidraw/excalidraw'

import { BUNDLED_LIBRARIES } from './packs'

export { BUNDLED_LIBRARIES }

export async function loadBundledLibraries() {
  const packs = await Promise.all(BUNDLED_LIBRARIES.map(async (name) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}board-libraries/${name}.excalidrawlib`)
      return res.ok ? await loadLibraryFromBlob(await res.blob(), 'published') : []
    } catch {
      return [] // a missing pack leaves the library short, not the board broken
    }
  }))
  return packs.flat()
}
