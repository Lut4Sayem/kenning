import { expect, test, type Page } from '@playwright/test'
import { draw, teamBoard } from './boards'

// Presence on boards with two real users: named cursors, follow, bring everyone, zoom to fit (plan Task 3.2).
// Needs the app on E2E_BASE_URL (default :8080) and the collaboration service it points to.
test.setTimeout(90_000)

const zoom = (page: Page) => page.getByRole('button', { name: 'Reset zoom' }) // Excalidraw's zoom readout, e.g. "130%"
const chip = (page: Page) => page.getByRole('status').filter({ hasText: /^Following/ })

async function zoomIn(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
}

/** Opens the avatar menu of `name` in the board's presence stack and picks `item`. */
async function avatarMenu(page: Page, name: string, item: string) {
  await page.getByRole('group', { name: /^Also on this board/ }).getByRole('button', { name }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('cursor names visible', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  const box = (await ann.page.locator('.excalidraw canvas.interactive').boundingBox())!
  for (let i = 0; i < 5; i++) await ann.page.mouse.move(box.x + 500 + i * 20, box.y + 300)
  await expect(bea.page.locator('[data-cursors="Ann Writer"]')).toHaveCount(1, { timeout: 2000 })
})

test('follow moves my view', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await zoomIn(ann.page, 3)
  await expect(zoom(ann.page)).toHaveText('130%')
  await expect(zoom(bea.page)).toHaveText('100%')
  await avatarMenu(bea.page, 'Ann Writer', 'Follow')
  await expect(chip(bea.page)).toHaveText('Following Ann Writer · Stop')
  await expect(zoom(bea.page)).toHaveText('130%', { timeout: 2000 }) // same window size, so the same zoom

  await zoomIn(ann.page, 1) // still following: Bea's view keeps up
  await expect(zoom(bea.page)).toHaveText('140%', { timeout: 2000 })
  await chip(bea.page).getByRole('button', { name: 'Stop' }).click()
  await expect(chip(bea.page)).toHaveCount(0)
  await zoomIn(ann.page, 1)
  await expect(zoom(ann.page)).toHaveText('150%')
  await bea.page.waitForTimeout(1000)
  await expect(zoom(bea.page)).toHaveText('140%')
})

test('bring everyone moves the other view', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await zoomIn(ann.page, 3)
  await expect(zoom(ann.page)).toHaveText('130%')
  await avatarMenu(ann.page, 'Bea Second', 'Bring everyone to me')
  await expect(chip(bea.page)).toHaveText('Following Ann Writer · Stop', { timeout: 2000 })
  await expect(zoom(bea.page)).toHaveText('130%', { timeout: 2000 })
  await expect(chip(ann.page)).toHaveCount(0) // the one who brings does not follow anyone
})

test('Shift+1 zooms to fit', async ({ browser }) => {
  const { ann } = await teamBoard(browser, 'EDITOR')
  await zoomIn(ann.page, 3)
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(zoom(ann.page)).toHaveText('130%')
  await ann.page.keyboard.press('Shift+Digit1')
  await expect(zoom(ann.page)).not.toHaveText('130%')
})

test('follow chip is visible and Stop works at phone width', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await bea.page.setViewportSize({ width: 375, height: 812 }) // Excalidraw moves its toolbar to the bottom
  await expect(bea.page.locator('.excalidraw--mobile')).toHaveCount(1)
  await avatarMenu(bea.page, 'Ann Writer', 'Follow')
  await expect(chip(bea.page)).toBeVisible()
  const box = (await chip(bea.page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  const tools = await bea.page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
  if (tools) expect(box.y >= tools.y + tools.height || box.y + box.height <= tools.y).toBeTruthy() // no overlap
  await chip(bea.page).getByRole('button', { name: 'Stop' }).click() // fails if something covers it
  await expect(chip(bea.page)).toHaveCount(0)
})
