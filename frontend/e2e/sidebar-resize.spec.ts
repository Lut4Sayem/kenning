import { expect, test, type Page } from '@playwright/test'

// The docked sidebar's right edge resizes it (200-420px, default 248), remembered across reloads; none in the phone drawer.
// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it.
async function logIn(page: Page) {
  const email = `resize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Resize Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app')
}

const sidebarWidth = (page: Page) => page.locator('#kf-sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))

async function dragTo(page: Page, x: number) {
  const box = (await page.getByRole('separator', { name: 'Resize sidebar' }).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
}

test('drag, limits, reload, double-click and arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await logIn(page)
  const handle = page.getByRole('separator', { name: 'Resize sidebar' })
  expect(await sidebarWidth(page)).toBe(248)
  await expect(handle).toHaveCSS('cursor', 'col-resize')

  await dragTo(page, 330)
  expect(await sidebarWidth(page)).toBe(330)
  await page.reload()
  expect(await sidebarWidth(page)).toBe(330)

  await dragTo(page, 900)
  expect(await sidebarWidth(page)).toBe(420)
  await dragTo(page, 50)
  expect(await sidebarWidth(page)).toBe(200)

  await handle.dblclick()
  expect(await sidebarWidth(page)).toBe(248)

  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await sidebarWidth(page)).toBe(280)
  await expect(handle).toHaveAttribute('aria-valuenow', '280')
  await page.keyboard.press('ArrowLeft')
  expect(await sidebarWidth(page)).toBe(264)
})

test('the phone drawer has no resize handle', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await logIn(page)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
  await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveCount(0)
})
