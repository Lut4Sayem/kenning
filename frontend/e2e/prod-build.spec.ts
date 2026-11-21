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
