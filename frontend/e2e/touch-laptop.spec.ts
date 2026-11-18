import { expect, test, type Locator, type Page } from '@playwright/test'

// A Windows laptop that reports a touchscreen (even a broken one) matches (pointer: coarse) / (hover: none) at 1440px.
// Its sidebar must look like any desktop one: full names, row buttons at 0 width until hover, focus or a tap.
// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it.
test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true })
test.setTimeout(90_000)

async function call(page: Page, url: string, data: unknown) {
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await page.request.post(url, { data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `post ${url} -> ${res.status()}`).toBeTruthy()
  return res.json()
}

const width = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().width)

test('a touch-reporting laptop gets full page names and hidden row buttons', async ({ page }) => {
  const email = `laptop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Laptop Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  const team = await call(page, '/api/teams', { teamName: 'CSE400 Thesis Group', teamDescription: '' })
  const lit = await call(page, `/api/teams/${team.id}/spaces`, { name: 'Literature Review', description: '' })
  const parent = await call(page, `/api/spaces/${lit.id}/nodes`, { title: 'Findings' })
  const child = await call(page, `/api/spaces/${lit.id}/nodes`, { title: 'Related work', parentId: parent.id })

  await page.goto(`/app/p/${child.id}`) // opens the branch that holds it
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches)).toBe(true)

  const space = page.locator(`[data-space="${lit.id}"]`)
  for (const title of ['Findings', 'Related work']) {
    const name = space.getByRole('treeitem', { name: title })
    await expect(name).toBeVisible()
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth), `${title} is cut off`).toBe(true)
    const buttons = [`New sub-page under ${title}`, `More actions for ${title}`, `Drag to move ${title}`].map((n) => space.getByRole('button', { name: n }))
    const widths = () => Promise.all(buttons.map(width))
    if (title === 'Findings') { // rest, hover, focus and a tap, on one row
      for (const w of await widths()) expect(w).toBeCloseTo(0, 1)
      await name.hover()
      for (const w of await widths()) expect(w).toBeGreaterThan(0)
      await page.mouse.move(800, 450)
      for (const w of await widths()) expect(w).toBeCloseTo(0, 1)
      await name.focus()
      for (const w of await widths()) expect(w).toBeGreaterThan(0)
      await name.blur()
      await name.tap() // opens the page, whose loaded details swap the row's … placeholder for the real menu button
      await expect.poll(async () => Math.min(...(await widths()))).toBeGreaterThan(0)
    } else {
      for (const w of await widths()) expect(w).toBeCloseTo(0, 1)
    }
  }
})
