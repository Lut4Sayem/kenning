import { expect, test } from '@playwright/test'

// The dev token panel (and the local redesign lab behind it) must never ship: main.tsx imports it only under import.meta.env.DEV.
// Runs against the built app that Spring serves, so it checks the real production bundle.
test('the production build has no dev Tokens button and no dev code', async ({ page }) => {
  await page.goto('/app/login')
  await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible()
  await page.waitForLoadState('networkidle') // the panel would mount after a dynamic import
  await expect(page.getByRole('button', { name: 'Tokens' })).toHaveCount(0)
  await expect(page.locator('#kf-dev-tokens')).toHaveCount(0)

  const entry = await page.locator('script[type="module"][src]').first().getAttribute('src')
  const js = await (await page.request.get(entry!)).text()
  for (const marker of ['kf-dev-tokens', 'kf-token-panel', 'mountRedesign']) expect(js.includes(marker), marker).toBe(false)
})

// Excalidraw falls back to a public CDN for any font or asset it can't find under our own path (WB anti-goal 7).
test('board has no external requests', async ({ page, context }) => {
  const email = `prod-board-${Date.now()}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Ann Writer', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app')
  const token = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const post = async (url: string, data: unknown) =>
    (await page.request.post(url, { data, headers: { 'X-XSRF-TOKEN': token } })).json()
  const team = await post('/api/teams', { teamName: 'Thesis group', teamDescription: '' })
  const space = await post(`/api/teams/${team.id}/spaces`, { name: 'Chapters', description: '' })
  const node = await post(`/api/spaces/${space.id}/nodes`, { title: 'Sketch', type: 'BOARD' })

  const origin = new URL(page.url()).origin
  const outside: string[] = []
  // index.html loads the app's own typefaces from Google Fonts on every page; anything else is Excalidraw leaking out
  const appFonts = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
  page.on('request', (r) => {
    const url = r.url()
    if (!url.startsWith(origin) && !url.startsWith('data:') && !appFonts.test(url)) outside.push(url)
  })
  await page.goto(`/app/b/${node.id}`)
  await expect(page.locator('[data-board]')).toHaveAttribute('data-ready', 'true')
  const canvas = page.locator('.excalidraw canvas.interactive')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await canvas.click({ position: { x: 600, y: 300 } })
  await page.keyboard.type('Hello board')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-board]')).toHaveAttribute('data-live', 'text')
  await page.waitForLoadState('networkidle') // fonts load after the text is drawn
  expect(outside).toEqual([])
})
