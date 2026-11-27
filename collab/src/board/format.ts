export const ELEMENTS = 'elements'
export const META = 'meta'
export const ALLOWED_TYPES: ReadonlySet<string> = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text'])
export const LIMITS = { points: 5000, textChars: 10000, customDataBytes: 1024, elementBytes: 262144 }
export const TOMBSTONE_KEEP = ['id', 'type', 'version', 'versionNonce', 'isDeleted', 'index', 'updated']
// Same bytes as EMPTY_BOARD_STATE in frontend/src/board/format.ts: every copy of a board must share this root (D6).
export const EMPTY_BOARD_STATE =
  'AQEBACgBBG1ldGENZm9ybWF0VmVyc2lvbgF9AQA='
