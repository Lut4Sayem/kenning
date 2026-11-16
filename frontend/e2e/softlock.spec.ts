import { expect, test, type Browser, type BrowserContext } from '@playwright/test'

// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it.
// Two users, both editors of one team page: the second one gets the soft-lock banner.
test.setTimeout(90_000)

async function signUp(browser: Browser, fullName: string): Promise<BrowserContext> {
  const context = await browser.newContext()
  const email = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await context.request.post('/api/auth/register', { data: { fullName, email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await context.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  return context
}

/** API call as that user, with the CSRF header the app needs on writes. */
async function call(context: BrowserContext, method: 'get' | 'post' | 'put', url: string, data?: unknown) {
  const token = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await context.request[method](url, { data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `${method} ${url} -> ${res.status()}`).toBeTruthy()
  return res.json().catch(() => null)
}

test('second editor sees who is editing, can read, or take over', async ({ browser }) => {
  const rafi = await signUp(browser, 'Rafi Lockholder')
  const mina = await signUp(browser, 'Mina Second')

  const team = await call(rafi, 'post', '/api/teams', { teamName: 'Lock team' })
  const space = await call(rafi, 'post', `/api/teams/${team.id}/spaces`, { name: 'Thesis' })
  const node = await call(rafi, 'post', `/api/spaces/${space.id}/nodes`, { title: 'Shared page' })
  const invite = await call(rafi, 'post', `/api/teams/${team.id}/invite`)
  await call(mina, 'post', `/api/team-invites/${invite.inviteCode}/join`)
  const [request] = await call(rafi, 'get', `/api/teams/${team.id}/join-requests`)
  await call(rafi, 'post', `/api/teams/${team.id}/join-requests/${request.id}/accept`)
  const minaUser = await call(mina, 'get', '/api/me')
  await call(rafi, 'put', `/api/teams/${team.id}/members/${minaUser.id}/role`, { role: 'EDITOR' })

  const first = await rafi.newPage()
  await first.goto(`/app/p/${node.id}`)
  await expect(first.locator('.bn-editor[contenteditable="true"]')).toBeVisible()
  await first.locator('.bn-editor').click()
  await first.keyboard.type('Written by Rafi')
  await expect(first.locator('header [role="status"]')).toHaveText('Saved')

  const second = await mina.newPage()
  await second.goto(`/app/p/${node.id}`)
  const banner = second.getByRole('status').filter({ hasText: 'Rafi Lockholder is editing right now.' })
  await expect(banner).toBeVisible()
  await expect(second.locator('.bn-editor')).toContainText('Written by Rafi')
  await expect(second.locator('.bn-editor[contenteditable="true"]')).toHaveCount(0) // not editable behind the banner

  await second.getByRole('button', { name: 'Open read-only' }).click()
  await expect(banner).toHaveCount(0)
  await expect(second.locator('.bn-editor[contenteditable="true"]')).toHaveCount(0)

  await second.reload()
  await second.getByRole('button', { name: 'Edit anyway' }).click()
  await expect(banner).toHaveCount(0)
  await second.locator('.bn-editor[contenteditable="true"]').click()
  await second.keyboard.press('Control+End')
  await second.keyboard.type(' and Mina')
  await expect(second.locator('header [role="status"]')).toHaveText('Saved')

  // Rafi's next heartbeat (every 20 s) finds the lock taken: he is told so, read-only, his changes kept (QA-27).
  await expect(first.getByRole('status').filter({ hasText: 'Mina Second started editing too. Your view is now read-only; your last changes were saved.' })).toBeVisible({ timeout: 30_000 })
  await expect(first.locator('.bn-editor[contenteditable="true"]')).toHaveCount(0)
  await first.getByRole('button', { name: 'Reload' }).click() // loads the latest content, Mina's included
  for (const text of ['Written by Rafi', 'and Mina']) await expect(first.locator('.bn-editor')).toContainText(text)

  await rafi.close()
  await mina.close()
})
