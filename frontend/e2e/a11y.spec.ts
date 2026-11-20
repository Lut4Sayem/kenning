import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Plan 10.2: axe on the main screens (no serious or critical violations) and a keyboard-only walk.
// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Each test registers a fresh user.
test.setTimeout(120_000)

async function call(page: Page, method: 'get' | 'post' | 'put', url: string, data?: unknown) {
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await page.request[method](url, { data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `${method} ${url} -> ${res.status()}`).toBeTruthy()
  return res.json().catch(() => null)
}

async function signUp(page: Page) {
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Axe Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  const space = (await call(page, 'get', '/api/me/spaces')).find((s: { ownerType: string }) => s.ownerType === 'USER')
  const parent = await call(page, 'post', `/api/spaces/${space.id}/nodes`, { title: 'Reading notes' })
  await call(page, 'post', `/api/spaces/${space.id}/nodes`, { title: 'Chapter one', parentId: parent.id })
  const gone = await call(page, 'post', `/api/spaces/${space.id}/nodes`, { title: 'Old draft' })
  await call(page, 'post', `/api/nodes/${gone.id}/trash`)
  return { space, parent }
}

/** Fails with the rule ids, impact and first offending selectors, so the report says what to fix. */
async function expectNoSeriousViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect.soft(bad, `${screen}\n${bad.join('\n')}`).toEqual([])
}

test('axe: login', async ({ page }) => {
  await page.goto('/app/login')
  await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible()
  await expectNoSeriousViolations(page, 'login')
})

test('axe: home, page view, palette, history, trash, team page', async ({ page }) => {
  const { space, parent } = await signUp(page)

  await page.goto('/app/')
  await expect(page.locator('[data-space]').first()).toBeVisible()
  await expectNoSeriousViolations(page, 'home')

  await page.goto(`/app/p/${parent.id}`)
  await page.locator('.bn-editor[contenteditable="true"]').click()
  await page.keyboard.type('Some words')
  await expect(page.locator('header [role="status"]')).toHaveText('Saved')
  await expectNoSeriousViolations(page, 'page view (editor)')

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search pages and actions' })).toBeVisible()
  await expectNoSeriousViolations(page, 'Ctrl+K palette')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Version history' }).click()
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
  await expectNoSeriousViolations(page, 'history panel')

  await page.goto(`/app/s/${space.id}/trash`)
  await expect(page.getByRole('listitem').filter({ hasText: 'Old draft' })).toBeVisible()
  await expectNoSeriousViolations(page, 'trash')

  const team = await call(page, 'post', '/api/teams', { teamName: `Axe team ${Date.now()}`, teamDescription: '' })
  await call(page, 'post', `/api/teams/${team.id}/spaces`, { name: 'Literature', description: '' })
  await page.goto(`/app/teams/${team.id}`)
  await expect(page.getByRole('heading', { name: /Axe team/ })).toBeVisible()
  await expectNoSeriousViolations(page, 'team page')
})

/** Presses Tab (at most `max` times) until the target has focus: keyboard only, no clicks. */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement), null, { timeout: 2000 }).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

test('keyboard only: tree, editor, palette, history, trash', async ({ page }) => {
  const { parent } = await signUp(page)
  await page.goto('/app/')
  const tree = page.locator('[data-space]').first()

  // Tree: one Tab stop, arrows move and expand, Enter opens the page.
  await tabTo(page, tree.getByRole('treeitem', { name: 'Reading notes' }))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(tree.getByRole('treeitem', { name: 'Chapter one' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/app\/p\//)

  // Editor: reachable by Tab, typing saves.
  await tabTo(page, page.locator('.bn-editor[contenteditable="true"]'))
  await page.keyboard.type('Typed with the keyboard')
  await expect(page.locator('header [role="status"]')).toHaveText('Saved')

  // Palette: Ctrl+K, type, Enter opens the match.
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search pages and actions' })).toBeVisible()
  await page.keyboard.type('Reading notes')
  await expect(page.getByRole('option', { name: 'Reading notes' }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/app/p/${parent.id}$`))

  // History: open the panel and close it again.
  await tabTo(page, page.getByRole('button', { name: 'Version history' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Close history' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeHidden()

  // Trash: the space menu opens it, Restore brings the page back.
  await tabTo(page, page.getByRole('button', { name: 'More actions for Private' }))
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('menuitem', { name: 'Trash' })) // this menu has no arrow keys yet; Tab reaches its items
  await page.keyboard.press('Enter')
  const row = page.getByRole('listitem').filter({ hasText: 'Old draft' })
  await tabTo(page, row.getByRole('button', { name: 'Restore' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'was restored' })).toBeVisible()
})
