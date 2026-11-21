/** One line per event, ids only, never content. */
export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}
