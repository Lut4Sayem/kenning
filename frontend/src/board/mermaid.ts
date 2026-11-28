// Mermaid code -> board shapes (WB 7.5). Only diagrams that become real shapes go in; every other outcome is a message,
// never a blank result. Excalidraw's own Mermaid dialog would insert an image for other types (forbidden, WB 7.1).
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { ALLOWED_TYPES } from './format'

export const UNSUPPORTED = "This diagram type isn't supported yet. Try a flowchart, sequence or class diagram."
export const EMPTY_INPUT = 'Paste Mermaid code to turn it into shapes.'
export const NOTHING_TO_DRAW = 'This diagram has nothing to draw yet. Add a node or two.'
export const UNREADABLE = "This Mermaid code couldn't be read. Check it and try again."

type Skeletons = Parameters<typeof convertToExcalidrawElements>[0]
export type BoardElements = ReturnType<typeof convertToExcalidrawElements>
export type MermaidResult = { ok: true; elements: BoardElements } | { ok: false; message: string }

export function toBoardElements(result: { elements: unknown[]; files?: Record<string, unknown> }): MermaidResult {
  if (result.files && Object.keys(result.files).length > 0) return { ok: false, message: UNSUPPORTED } // drawn as an image
  const elements = convertToExcalidrawElements(result.elements as Skeletons, { regenerateIds: true })
  if (elements.length === 0) return { ok: false, message: NOTHING_TO_DRAW }
  if (elements.some((e) => !ALLOWED_TYPES.has(e.type))) return { ok: false, message: UNSUPPORTED }
  return { ok: true, elements }
}

/** Mermaid's own message (it names the line); Mermaid sometimes throws a plain object with `str` instead of an Error. */
export function mermaidError(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { str?: unknown } | null)?.str
  return typeof text === 'string' && text.trim() ? text.trim() : UNREADABLE
}

export async function mermaidToBoard(code: string): Promise<MermaidResult> {
  if (!code.trim()) return { ok: false, message: EMPTY_INPUT }
  try {
    const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw') // Mermaid is big: loaded on first use
    return toBoardElements(await parseMermaidToExcalidraw(code))
  } catch (e) {
    return { ok: false, message: mermaidError(e) } // a parse error, or the chunk failed to load (offline)
  }
}

/** The shapes moved so their middle is at (x, y): an inserted diagram lands in the middle of the view. */
export function centerOn<T extends { x: number; y: number; width: number; height: number }>(els: readonly T[], x: number, y: number): T[] {
  const left = Math.min(...els.map((e) => e.x)), right = Math.max(...els.map((e) => e.x + e.width))
  const top = Math.min(...els.map((e) => e.y)), bottom = Math.max(...els.map((e) => e.y + e.height))
  const dx = x - (left + right) / 2, dy = y - (top + bottom) / 2
  return els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }))
}
