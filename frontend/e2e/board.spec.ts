import { expect, test } from '@playwright/test'
import { draw, drag, hint, live, teamBoard } from './boards'
import { BUNDLED_LIBRARIES } from '../src/board/packs'

// Live boards with two real users (two browser contexts) through the collaboration service.
// Needs the app on E2E_BASE_URL (default :8080) and the collaboration service it points to.
test.setTimeout(90_000)

test('both draw and see each other within 2 s', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await draw(bea.page, 'Pen', [680, 250], [780, 350])
  await expect(live(ann.page)).toHaveAttribute('data-live', 'freedraw,rectangle', { timeout: 2000 })
  await expect(live(bea.page)).toHaveAttribute('data-live', 'freedraw,rectangle')

  await expect(ann.page.locator('header [role="status"]')).toHaveText('Saved')
  await bea.page.reload() // stored by the service, not only passed along
  await expect(live(bea.page)).toHaveAttribute('data-live', 'freedraw,rectangle')
})

test('viewer sees live drawing and cannot draw', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'VIEWER')
  await expect(bea.page.getByText('View only')).toBeVisible()
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await expect(bea.page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(0) // no drawing tools in view mode
  await bea.page.keyboard.press('r') // the shortcut does nothing either
  await drag(bea.page, [680, 250], [780, 350])
  await ann.page.waitForTimeout(1000)
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle')
  await expect(live(ann.page)).toHaveAttribute('data-live', 'rectangle')
})

test('undo in tab A keeps tab B’s shape', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await draw(bea.page, 'Ellipse', [680, 250], [780, 350])
  await expect(live(ann.page)).toHaveAttribute('data-live', 'ellipse,rectangle', { timeout: 2000 })
  await ann.page.keyboard.press('Control+z')
  await expect(live(ann.page)).toHaveAttribute('data-live', 'ellipse')
  await expect(live(bea.page)).toHaveAttribute('data-live', 'ellipse', { timeout: 2000 })
  await ann.page.keyboard.press('Control+y')
  await expect(live(bea.page)).toHaveAttribute('data-live', 'ellipse,rectangle', { timeout: 2000 })
})

test('image paste is blocked', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await ann.page.locator('.excalidraw canvas.interactive').click({ position: { x: 600, y: 300 } })
  await ann.page.evaluate(async () => {
    const png = await (await fetch('/app/favicon-16.png')).blob()
    const data = new DataTransfer()
    data.items.add(new File([png], 'shot.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await ann.page.waitForTimeout(1000)
  for (const p of [ann, bea]) await expect(live(p.page)).toHaveAttribute('data-live', '')
})

test('empty hint disappears on first shape', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await expect(ann.page.getByText(hint)).toBeVisible()
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(ann.page.getByText(hint)).toHaveCount(0)
  await expect(bea.page.getByText(hint)).toHaveCount(0, { timeout: 2000 })
})

type Item = { elements?: { type: string }[] } | { type: string }[]

test('shape pack inserts a UML class, no external requests', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  const external: string[] = []
  ann.page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url())
  })
  // The class box is the pack item made of one rectangle and one divider line. Find it by that content in the packs, in the
  // order the library lists them, so adding or reordering packs cannot point the click at another item.
  const items = (await Promise.all(BUNDLED_LIBRARIES.map(async (name) => {
    const res = await ann.page.request.get(`/app/board-libraries/${name}.excalidrawlib`)
    const pack = (await res.json()) as { libraryItems?: Item[]; library?: Item[] } // v2 packs say libraryItems, v1 library
    return pack.libraryItems ?? pack.library ?? []
  }))).flat().map((item) => (Array.isArray(item) ? item : (item.elements ?? []))) // a pack item is its elements, or an object holding them
  const classBox = items.findIndex((el) => el.length === 2 && el.some((e) => e.type === 'rectangle') && el.some((e) => e.type === 'line'))
  expect(classBox).toBeGreaterThanOrEqual(0)
  await ann.page.locator('.default-sidebar-trigger').click() // the library panel (our toolbar must not cover it)
  const units = ann.page.locator('.library-unit')
  await expect(units).toHaveCount(items.length)
  await units.nth(classBox).click()
  await expect(live(ann.page)).toHaveAttribute('data-live', 'line,rectangle')
  expect(external).toEqual([])
})

test('mermaid flowchart import', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  await ann.page.getByRole('button', { name: 'Mermaid', exact: true }).click()
  await ann.page.getByRole('textbox').fill('flowchart LR\n  A[Idea] --> B[Plan]')
  await ann.page.getByRole('button', { name: 'Insert' }).click()
  await expect(live(ann.page)).toHaveAttribute('data-live', /rectangle.*text/)
  await expect(ann.page.getByRole('heading', { name: 'Mermaid to shapes' })).toHaveCount(0) // the dialog closed
})

test('unsupported mermaid type message', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  await ann.page.getByRole('button', { name: 'Mermaid', exact: true }).click()
  await ann.page.getByRole('textbox').fill('pie title Pets\n  "Dogs" : 3\n  "Cats" : 2')
  await ann.page.getByRole('button', { name: 'Insert' }).click()
  await expect(ann.page.getByRole('alert')).toHaveText("This diagram type isn't supported yet. Try a flowchart, sequence or class diagram.")
  await expect(live(ann.page)).toHaveAttribute('data-live', '') // nothing was drawn
})

/**
 * Opens Excalidraw's export dialog (Ctrl+Shift+E) and picks PNG or SVG. Chromium saves through a native file picker
 * (no download event), so the picker is replaced by one that keeps the suggested name and the bytes.
 */
async function exportAs(page: import('@playwright/test').Page, kind: 'PNG' | 'SVG') {
  await page.evaluate(() => {
    const w = window as unknown as { showSaveFilePicker: unknown; saved?: { name: string; text: string } }
    w.showSaveFilePicker = async (o: { suggestedName: string }) => ({
      createWritable: async () => {
        let blob: Blob
        return {
          write: async (b: Blob) => { blob = b },
          close: async () => { w.saved = { name: o.suggestedName, text: await blob.text() } },
        }
      },
    })
  })
  await page.keyboard.press('Control+Shift+E')
  const dialog = page.locator('.ImageExportModal')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: `Export to ${kind}` }).click()
  await page.waitForFunction(() => (window as unknown as { saved?: unknown }).saved)
  return page.evaluate(() => (window as unknown as { saved: { name: string; text: string } }).saved)
}

test('export png uses board title', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  expect((await exportAs(ann.page, 'PNG')).name).toBe('Method sketch.png')
})

test('export svg selection only', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await draw(ann.page, 'Ellipse', [900, 250], [1000, 350]) // the ellipse is the selection now
  const svg = await exportAs(ann.page, 'SVG')
  const width = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg.text)?.[1])
  expect(svg.name).toBe('Method sketch.svg')
  expect(width).toBeLessThan(200) // the ellipse alone (about 100 wide + padding); both shapes would be over 500
})
