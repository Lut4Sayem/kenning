// @vitest-environment node
import { expect, it, vi } from 'vitest'
import notice from '../../public/board-libraries/NOTICE?raw'
import { ALLOWED_TYPES } from './format'
import { BUNDLED_LIBRARIES } from './libraries'

vi.mock('@excalidraw/excalidraw', () => ({}))

const files = import.meta.glob<string>('../../public/board-libraries/*.excalidrawlib', { query: '?raw', import: 'default', eager: true })
const nameOf = (path: string) => path.split('/').pop()!.replace('.excalidrawlib', '')

it('everyBundledFileIsLoadedAndInNotice', () => {
  expect(Object.keys(files).map(nameOf).sort()).toEqual([...BUNDLED_LIBRARIES].sort())
  for (const name of BUNDLED_LIBRARIES) expect(notice).toContain(`${name}.excalidrawlib`)
})

it('bundledLibrariesHaveOnlyAllowedTypes', () => {
  for (const [path, text] of Object.entries(files)) {
    const lib = JSON.parse(text)
    // v1 files list bare element arrays under `library`, v2 files list items with `elements`
    const items: ({ elements: { type: string }[] } | { type: string }[])[] = lib.libraryItems ?? lib.library
    const types = new Set(items.flatMap((i) => (Array.isArray(i) ? i : i.elements)).map((e) => e.type))
    expect(items.length, path).toBeGreaterThan(0)
    expect([...types].filter((t) => !ALLOWED_TYPES.has(t)), path).toEqual([])
  }
})
