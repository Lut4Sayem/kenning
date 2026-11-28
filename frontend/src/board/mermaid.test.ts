import { beforeEach, expect, it, vi } from 'vitest'
import { EMPTY_INPUT, NOTHING_TO_DRAW, UNREADABLE, UNSUPPORTED, centerOn, mermaidError, mermaidToBoard, toBoardElements } from './mermaid'

const convert = vi.hoisted(() => vi.fn())
const parse = vi.hoisted(() => vi.fn())
vi.mock('@excalidraw/excalidraw', () => ({ convertToExcalidrawElements: convert }))
vi.mock('@excalidraw/mermaid-to-excalidraw', () => ({ parseMermaidToExcalidraw: parse }))

beforeEach(() => {
  convert.mockReset().mockImplementation((skeletons: { type: string }[]) => skeletons.map((s, i) => ({ ...s, id: `el${i}` })))
  parse.mockReset()
})

it('filesMeansUnsupported', () => {
  const r = toBoardElements({ elements: [{ type: 'image' }], files: { f1: { dataURL: 'data:' } } })
  expect(r).toEqual({ ok: false, message: "This diagram type isn't supported yet. Try a flowchart, sequence or class diagram." })
  expect(r).toEqual({ ok: false, message: UNSUPPORTED })
  expect(convert).not.toHaveBeenCalled()
})

it('elementsPassThroughConvert', () => {
  const skeletons = [{ type: 'rectangle', x: 0, y: 0 }, { type: 'arrow', x: 10, y: 10 }]
  const r = toBoardElements({ elements: skeletons, files: {} })
  expect(convert).toHaveBeenCalledWith(skeletons, { regenerateIds: true })
  expect(r).toEqual({ ok: true, elements: [{ ...skeletons[0], id: 'el0' }, { ...skeletons[1], id: 'el1' }] })
})

it('forbiddenTypeAfterConvertIsUnsupported', () => {
  expect(toBoardElements({ elements: [{ type: 'rectangle' }, { type: 'frame' }] })).toEqual({ ok: false, message: UNSUPPORTED })
})

it('noShapesIsAMessage', () => {
  expect(toBoardElements({ elements: [] })).toEqual({ ok: false, message: NOTHING_TO_DRAW })
})

it('parseErrorKeepsLineNumber', async () => {
  const message = "Parse error on line 2:\n...A --> \n---------^\nExpecting 'NODE_STRING', got 'EOF'"
  parse.mockRejectedValue(new Error(message))
  expect(await mermaidToBoard('flowchart TD\n  A --> ')).toEqual({ ok: false, message })
  expect(mermaidError({ str: 'Lexical error on line 3. Unrecognized text.' })).toBe('Lexical error on line 3. Unrecognized text.')
})

it('emptyInputIsAnError', async () => {
  expect(await mermaidToBoard('  \n ')).toEqual({ ok: false, message: EMPTY_INPUT })
  expect(parse).not.toHaveBeenCalled()
})

it('unreadableErrorsStillShowAMessage', () => {
  for (const e of [undefined, null, {}, new Error(''), '  ', 42]) expect(mermaidError(e)).toBe(UNREADABLE)
})

it('mermaidToBoardConvertsParsedResult', async () => {
  parse.mockResolvedValue({ elements: [{ type: 'diamond' }], files: undefined })
  expect(await mermaidToBoard('flowchart TD\n  A{Ok?}')).toEqual({ ok: true, elements: [{ type: 'diamond', id: 'el0' }] })
})

it('centerOnMovesTheMiddle', () => {
  const placed = centerOn([{ x: 0, y: 0, width: 10, height: 10, id: 'a' }, { x: 30, y: 20, width: 10, height: 20, id: 'b' }], 100, 100)
  expect(placed).toEqual([{ x: 80, y: 80, width: 10, height: 10, id: 'a' }, { x: 110, y: 100, width: 10, height: 20, id: 'b' }])
})
