import { expect, test } from '@playwright/test'
import { draw, drag, hint, live, teamBoard } from './boards'

// Live boards with two real users (two browser contexts) through the collaboration service.
// Needs the app on E2E_BASE_URL (default :8080) and the collaboration service it points to.
test.setTimeout(90_000)

test('both draw and see each other within 2 s', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await draw(bea.page, 'Draw', [680, 250], [780, 350])
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
  await expect(bea.page.getByRole('radio', { name: 'Rectangle' })).toHaveCount(0) // no drawing tools in view mode
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
