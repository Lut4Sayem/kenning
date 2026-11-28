import { expect, test, type Locator, type Page } from '@playwright/test'
import { board, teamBoard } from './boards'

// Board toolbar layout at four widths, and the board's dark mode. Needs the app on E2E_BASE_URL and the collaboration service.
test.setTimeout(120_000)

interface Rect { x: number; y: number; width: number; height: number }
const rect = async (l: Locator) => (await l.boundingBox()) as Rect | null
const apart = (a: Rect, b: Rect) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y

const chip = (page: Page) => page.getByRole('status').filter({ hasText: /^Following/ })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Board tools' })

for (const width of [1280, 1024, 768, 375]) {
  test(`toolbar is one row that covers nothing at ${width}px`, async ({ browser }) => {
    const { ann, bea } = await teamBoard(browser, 'EDITOR')
    const page = bea.page
    await page.setViewportSize({ width, height: 812 })
    await expect(toolbar(page)).toBeVisible()
    await page.getByRole('group', { name: /^Also on this board/ }).getByRole('button', { name: 'Ann Writer' }).click()
    await page.getByRole('menuitem', { name: 'Follow' }).click()
    await expect(chip(page)).toBeVisible()

    const ours = await toolbar(page).getByRole('button').all()
    expect(ours.length).toBeGreaterThanOrEqual(4)
    const boxes = await Promise.all(ours.map(rect))
    for (const b of boxes) {
      expect(b).not.toBeNull()
      expect(Math.abs(b!.y - boxes[0]!.y)).toBeLessThanOrEqual(1) // one row: the same top for every control
      expect(b!.x).toBeGreaterThanOrEqual(0)
      expect(b!.x + b!.width).toBeLessThanOrEqual(width) // nothing cut off at the right edge
    }

    const others = [
      page.locator('.default-sidebar-trigger'), // the Library button
      page.locator('.excalidraw .main-menu-trigger'),
      page.locator('.excalidraw .App-toolbar'), // Excalidraw's own tools, where it shows them
      chip(page),
    ]
    for (const other of others) {
      if ((await other.first().isVisible()) === false) continue // Excalidraw's own tools are hidden at wide widths on purpose
      const o = (await rect(other.first()))!
      for (const b of boxes) expect(apart(b!, o), `${other} overlaps ${JSON.stringify(b)} vs ${JSON.stringify(o)}`).toBe(true)
    }
    for (const required of [others[0], others[1], others[3]]) await expect(required.first()).toBeVisible() // so the loop above cannot skip them

    // one undo/redo set (the top bar's); Excalidraw's own are hidden
    await expect(page.getByRole('button', { name: 'Undo' }).locator('visible=true')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Redo' }).locator('visible=true')).toHaveCount(1)

    await chip(page).getByRole('button', { name: 'Stop' }).click() // fails if something covers it
    await expect(chip(page)).toHaveCount(0)
    await ann.context.close()
  })
}

test('dark mode switches the canvas and our controls, and survives a reload', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  const page = ann.page
  const bg = () => toolbar(page).evaluate((el) => getComputedStyle(el).backgroundColor)
  const light = await bg()
  await expect(page.locator('.excalidraw.theme--dark')).toHaveCount(0)
  await page.locator('.excalidraw .main-menu-trigger').click()
  await page.getByTestId('toggle-dark-mode').click()
  await expect(page.locator('.excalidraw.theme--dark')).toHaveCount(1)
  await expect.poll(bg).not.toBe(light)
  await page.reload()
  await expect(board(page)).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.excalidraw.theme--dark')).toHaveCount(1)
  await expect.poll(bg).not.toBe(light)
})
