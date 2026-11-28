export const ELEMENTS = 'elements'
export const META = 'meta'
// Same bytes as EMPTY_BOARD_STATE in collab/src/board/format.ts: every copy of a board must share this root (D6).
export const EMPTY_BOARD_STATE =
  'AQEBACgBBG1ldGENZm9ybWF0VmVyc2lvbgF9AQA='
// Same list as ALLOWED_TYPES in collab/src/board/format.ts: collab drops any other element type.
export const ALLOWED_TYPES: ReadonlySet<string> = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text'])
