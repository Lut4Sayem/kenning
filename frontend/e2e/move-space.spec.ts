import { expect, test, type Page } from '@playwright/test'

// QA-12: a team page moves (with its sub-pages) to another space of the same team, by "Move to…" or by dragging.
// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Each test registers a fresh user.
test.setTimeout(90_000)

async function call(page: Page, method: 'get' | 'post', url: string, data?: unknown) {
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await page.request[method](url, { data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `${method} ${url} -> ${res.status()}`).toBeTruthy()
  return res.json().catch(() => null)
}

/** A team with two spaces; "Methodology" (+ "Sampling") in the first one. */
async function teamWithTwoSpaces(page: Page) {
  const email = `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Move Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  const team = await call(page, 'post', '/api/teams', { teamName: `Thesis ${Date.now()}`, teamDescription: '' })
  const lit = await call(page, 'post', `/api/teams/${team.id}/spaces`, { name: 'Literature Review', description: '' })
  const exp = await call(page, 'post', `/api/teams/${team.id}/spaces`, { name: 'Experiments', description: '' })
  const method = await call(page, 'post', `/api/spaces/${lit.id}/nodes`, { title: 'Methodology' })
  await call(page, 'post', `/api/spaces/${lit.id}/nodes`, { title: 'Sampling', parentId: method.id })
  return { lit, exp, method }
}

const titles = async (page: Page, spaceId: string) =>
  ((await call(page, 'get', `/api/spaces/${spaceId}/tree`)) as { title: string }[]).map((n) => n.title).sort()

test('Move to… puts the page and its sub-pages in another space', async ({ page }) => {
  const { lit, exp, method } = await teamWithTwoSpaces(page)
  await page.goto(`/app/p/${method.id}`)
  await page.getByRole('button', { name: 'Page actions' }).click()
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move “Methodology” to…' })
  await expect(dialog.getByRole('radio', { name: 'Experiments' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(dialog).toBeHidden()

  expect(await titles(page, lit.id)).toEqual([])
  expect(await titles(page, exp.id)).toEqual(['Methodology', 'Sampling'])
  await expect(page.locator(`[data-space="${exp.id}"]`).getByRole('treeitem', { name: 'Methodology' })).toBeVisible()
})

test('dragging a page onto another space row moves it there', async ({ page }) => {
  const { lit, exp } = await teamWithTwoSpaces(page)
  await page.goto('/app')
  const from = page.locator(`[data-space="${lit.id}"]`)
  const to = page.locator(`[data-space="${exp.id}"]`)
  await from.getByRole('treeitem', { name: 'Methodology' }).hover()
  const grip = from.getByRole('button', { name: 'Drag to move Methodology' })
  const box = (await grip.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 5 }) // past the 5px start distance
  // Measured after the drag started: the "Move to top level" strips that appear then push the rows below down.
  await expect(from.getByTestId('top-drop')).toBeVisible()
  const target = (await to.getByRole('link', { name: 'Experiments' }).boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect(to.getByRole('treeitem', { name: 'Methodology' })).toBeVisible()
  await expect(from.getByRole('treeitem', { name: 'Methodology' })).toHaveCount(0)
  expect(await titles(page, exp.id)).toEqual(['Methodology', 'Sampling'])
})
