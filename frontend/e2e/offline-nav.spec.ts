import { expect, test, type Page } from '@playwright/test'

// QA-40: text typed offline must survive moving to another page inside the app (no full page load).
const editor = (page: Page) => page.locator('.bn-editor')
const saveState = (page: Page) => page.locator('header [role="status"]')

async function newPage(page: Page, title: string): Promise<string> {
  const before = page.url()
  await page.getByRole('button', { name: 'New private page' }).click()
  await page.waitForURL((u) => /\/app\/p\//.test(u.pathname) && u.toString() !== before)
  await expect(page.locator('.bn-editor[contenteditable="true"]')).toBeVisible()
  await page.getByLabel('Page title').fill(title)
  await page.getByLabel('Page title').press('Enter')
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('treeitem', { name: title })).toBeVisible()
  return page.url()
}

test('offline edits survive in-app navigation and are sent when back online', async ({ page, context, browser }) => {
  const email = `offnav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Offline Nav', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app/')
  await newPage(page, 'Related work')
  const methodology = await newPage(page, 'Methodology')
  const sidebar = page.getByRole('navigation', { name: 'Workspace' })

  await page.locator('.bn-editor[contenteditable="true"]').click()
  await page.keyboard.type('Saved online.')
  await expect(saveState(page)).toHaveText('Saved')

  await context.setOffline(true)
  await page.keyboard.type(' Typed offline.')
  await expect(saveState(page)).toHaveText('Offline: changes kept on this device')

  await sidebar.getByRole('treeitem', { name: 'Related work' }).click() // in-app, no page load
  await expect(page).not.toHaveURL(methodology)
  await context.setOffline(false)

  // Sent without reopening the page: another browser, with nothing on its device, sees it.
  const other = await browser.newContext()
  expect((await other.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  const elsewhere = await other.newPage()
  await expect(async () => {
    await elsewhere.goto(methodology)
    await expect(editor(elsewhere)).toContainText('Saved online. Typed offline.', { timeout: 2000 })
  }).toPass({ timeout: 15_000 })
  await other.close()

  await sidebar.getByRole('treeitem', { name: 'Methodology' }).click()
  await expect(page).toHaveURL(methodology)
  await expect(editor(page)).toContainText('Saved online. Typed offline.')
  await expect(saveState(page)).toHaveText('Saved')

  await page.reload() // and it really reached the server
  await expect(editor(page)).toContainText('Saved online. Typed offline.')
})
