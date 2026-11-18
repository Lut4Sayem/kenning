import { expect, test } from '@playwright/test'

// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Registers a fresh user per run.
test('create page, create sub-page, drag it to top level, breadcrumbs update', async ({ page }) => {
  const email = `tree-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Tree Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app')

  // A new user only has the private space.
  const priv = page.locator('[data-space]').first()
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
  // Row buttons take no width until the row is hovered or focused, so tests reach them by keyboard.
  await priv.getByRole('button', { name: /new page/i }).press('Enter')
  await page.waitForURL(/\/app\/p\//)
  await page.getByLabel('Page title').fill('Parent')
  await page.getByLabel('Page title').blur()
  await expect(priv.getByRole('treeitem', { name: 'Parent' })).toBeVisible()

  const parentUrl = page.url()
  await priv.getByRole('button', { name: 'New sub-page under Parent' }).press('Enter')
  await page.waitForURL((url) => url.href !== parentUrl)
  await page.getByLabel('Page title').fill('Child')
  await page.getByLabel('Page title').blur()
  await expect(priv.getByRole('treeitem', { name: 'Child' })).toBeVisible()
  await expect(crumbs).toContainText('Parent')

  // Drag Child (keyboard sensor on its grip) down onto the "top level" drop zone.
  await priv.getByRole('button', { name: 'Drag to move Child' }).focus()
  // How many steps that takes depends on row heights (fonts), so step until the zone lights up.
  await page.keyboard.press('Space')
  const dropZone = priv.getByTestId('top-drop')
  await expect(dropZone).toBeVisible()
  for (let i = 0; i < 12 && (await dropZone.getAttribute('data-over')) !== 'true'; i++) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(50)
  }
  await expect(dropZone).toHaveAttribute('data-over', 'true')
  await page.keyboard.press('Space')

  await expect(crumbs).not.toContainText('Parent')
  await expect(priv.getByRole('button', { name: 'New sub-page under Child' })).toBeAttached() // still in the tree, now a sibling
})
