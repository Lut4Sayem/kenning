import { expect, test, type Locator, type Page } from '@playwright/test'

// Sidebar row buttons follow the layout, not hover/pointer media queries (touch laptops match those with a mouse).
// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Each test registers a fresh user.
test.setTimeout(90_000)

async function call(page: Page, url: string, data: unknown) {
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await page.request.post(url, { data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `post ${url} -> ${res.status()}`).toBeTruthy()
  return res.json()
}

async function teamSpacePage(page: Page) {
  const email = `rows-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Row Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  const team = await call(page, '/api/teams', { teamName: 'Thesis', teamDescription: '' })
  const lit = await call(page, `/api/teams/${team.id}/spaces`, { name: 'Literature Review', description: '' })
  await call(page, `/api/spaces/${lit.id}/nodes`, { title: 'Methodology' })
  return lit
}

const width = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().width)

test('wide layout with a mouse: names in full, row buttons on hover, right-click opens the row menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const lit = await teamSpacePage(page)
  await page.goto('/app')
  const space = page.locator(`[data-space="${lit.id}"]`)
  const name = space.getByRole('link', { name: 'Literature Review', exact: true })
  await expect(name).toBeVisible()
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true) // not cut to "Literatu…"
  const more = space.getByRole('button', { name: 'More actions for Literature Review' })
  expect(await width(more)).toBeCloseTo(0, 1)
  await name.hover()
  await expect.poll(() => width(more)).toBeGreaterThan(0)

  const row = space.getByRole('treeitem', { name: 'Methodology' })
  expect(await width(space.getByRole('button', { name: 'More actions for Methodology' }))).toBeCloseTo(0, 1)
  await row.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'More actions for Methodology' })
  await expect(menu.getByRole('menuitem', { name: 'Move to trash' })).toBeVisible()
  const [m, nav] = [(await menu.boundingBox())!, (await page.getByRole('navigation', { name: 'Workspace' }).boundingBox())!]
  expect(m.x).toBeGreaterThanOrEqual(nav.x) // inside the sidebar, which clips anything wider
  expect(m.x + m.width).toBeLessThanOrEqual(nav.x + nav.width)
})

test('phone drawer: every row shows … and +, no grip', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const lit = await teamSpacePage(page)
  await page.goto('/app')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const space = page.locator(`[data-space="${lit.id}"]`)
  for (const label of ['More actions for Literature Review', 'New page in Literature Review', 'More actions for Methodology', 'New sub-page under Methodology']) {
    await expect(space.getByRole('button', { name: label })).toBeVisible()
    expect(await width(space.getByRole('button', { name: label }))).toBeCloseTo(40, 1)
  }
  expect(await width(space.getByRole('button', { name: 'Drag to move Methodology' }))).toBeCloseTo(0, 1)
})

test('the row menu opens upward near the bottom of the sidebar, so it stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 560 })
  const lit = await teamSpacePage(page)
  for (let i = 1; i <= 8; i++) await call(page, `/api/spaces/${lit.id}/nodes`, { title: `Note ${i}` })
  await page.goto('/app')
  const last = page.locator(`[data-space="${lit.id}"]`).getByRole('treeitem', { name: 'Note 8' })
  await last.evaluate((el) => el.scrollIntoView({ block: 'end' }))
  const before = (await last.boundingBox())!
  await last.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'More actions for Note 8' })
  await expect(menu.getByRole('menuitem', { name: 'Move to trash' })).toBeVisible()
  const scroll = (await last.evaluate((el) => {
    let box = el.parentElement
    while (box && getComputedStyle(box).overflowY !== 'auto') box = box.parentElement
    const r = box!.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  }))
  const m = (await menu.boundingBox())!
  expect(m.y).toBeGreaterThanOrEqual(scroll.top)
  expect(m.y + m.height).toBeLessThanOrEqual(scroll.bottom)
  expect((await last.boundingBox())!.y).toBeCloseTo(before.y, 0) // the sidebar did not have to scroll to show it
  expect(m.y + m.height).toBeLessThanOrEqual(before.y) // it opened above the row
})
