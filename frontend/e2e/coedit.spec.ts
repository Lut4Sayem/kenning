import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { realNetwork } from './network'

// Live editing with two real users (two browser contexts) through the collaboration service.
// Needs the app on E2E_BASE_URL (default :8080) and the collaboration service it points to.
test.setTimeout(90_000)

interface Person { context: BrowserContext; page: Page; id: string; name: string; net: Awaited<ReturnType<typeof realNetwork>> }

const editor = (page: Page) => page.locator('.bn-editor')
const editable = (page: Page) => page.locator('.bn-editor[contenteditable="true"]')
const saveState = (page: Page) => page.locator('header [role="status"]')

async function post(request: APIRequestContext, context: BrowserContext, url: string, data?: unknown, method = 'POST') {
  const token = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await request.fetch(url, { method, data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `${method} ${url} -> ${res.status()}`).toBeTruthy()
  return res.status() === 204 || !(await res.text()) ? null : res.json()
}

async function person(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext()
  const net = await realNetwork(context)
  const page = await context.newPage()
  const email = `coedit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: name, email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app') // sets the CSRF cookie
  const me = await (await page.request.get('/api/me')).json()
  return { context, page, id: me.id, name, net }
}

/** Ann makes a team page; Bea joins the team with `role`. */
async function teamPage(browser: Browser, role: 'EDITOR' | 'VIEWER') {
  const ann = await person(browser, 'Ann Writer')
  const bea = await person(browser, 'Bea Second')
  const call = (p: Person, url: string, data?: unknown, method?: string) => post(p.page.request, p.context, url, data, method)
  const team = await call(ann, '/api/teams', { teamName: 'Thesis group', teamDescription: '' })
  const space = await call(ann, `/api/teams/${team.id}/spaces`, { name: 'Chapters', description: '' })
  const node = await call(ann, `/api/spaces/${space.id}/nodes`, { title: 'Chapter 3 plan' })
  const invite = await call(ann, `/api/teams/${team.id}/invite`)
  const request = await call(bea, `/api/team-invites/${invite.inviteCode}/join`)
  await call(ann, `/api/teams/${team.id}/join-requests/${request.id}/accept`, { role })
  for (const p of [ann, bea]) await p.page.goto(`/app/p/${node.id}`)
  return { ann, bea, team, node, call }
}

async function typeAtEnd(page: Page, text: string) {
  await editable(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('two editors type in one page and see each other within 2 s, with named cursors and avatars', async ({ browser }) => {
  const { ann, bea } = await teamPage(browser, 'EDITOR')
  await typeAtEnd(ann.page, 'Ann writes the method. ')
  await expect(editor(bea.page)).toContainText('Ann writes the method.', { timeout: 2000 })
  await typeAtEnd(bea.page, 'Bea adds the data. ')
  await expect(editor(ann.page)).toContainText('Bea adds the data.', { timeout: 2000 })
  await expect(ann.page.locator('.bn-collaboration-cursor__label', { hasText: 'Bea Second' })).toBeVisible()
  await expect(ann.page.getByRole('img', { name: /Also on this page: Bea Second/ })).toBeVisible()

  await expect(saveState(ann.page)).toHaveText('Saved')
  await expect(saveState(bea.page)).toHaveText('Saved')
  await bea.page.reload() // stored by the service, not only passed along
  for (const t of ['Ann writes the method.', 'Bea adds the data.']) await expect(editor(bea.page)).toContainText(t)
})

test('a viewer watches live and cannot type', async ({ browser }) => {
  const { ann, bea } = await teamPage(browser, 'VIEWER')
  await expect(editor(bea.page)).toBeVisible()
  await expect(editable(bea.page)).toHaveCount(0)
  await typeAtEnd(ann.page, 'Visible to the supervisor. ')
  await expect(editor(bea.page)).toContainText('Visible to the supervisor.', { timeout: 2000 })
  await expect(ann.page.getByRole('img', { name: /Also on this page: Bea Second \(viewing\)/ })).toBeVisible()
  await editor(bea.page).click()
  await bea.page.keyboard.type('should not appear')
  await ann.page.waitForTimeout(1000)
  await expect(editor(ann.page)).not.toContainText('should not appear')
  await expect(ann.page.locator('.bn-collaboration-cursor__label', { hasText: 'Bea Second' })).toHaveCount(0) // no cursor for viewers
})

test('a member removed mid-session stops editing at once', async ({ browser }) => {
  const { ann, bea, team, call } = await teamPage(browser, 'EDITOR')
  await typeAtEnd(bea.page, 'Before removal. ')
  await expect(editor(ann.page)).toContainText('Before removal.', { timeout: 2000 })

  await call(ann, `/api/teams/${team.id}/members/${bea.id}`, undefined, 'DELETE')
  await expect(editable(bea.page)).toHaveCount(0, { timeout: 5000 }) // read-only, or the page is gone
  await bea.page.keyboard.type('after removal')
  await ann.page.waitForTimeout(1500)
  await expect(editor(ann.page)).not.toContainText('after removal')
})

test('edits typed offline merge when the connection comes back', async ({ browser }) => {
  const { ann, bea } = await teamPage(browser, 'EDITOR')
  await typeAtEnd(ann.page, 'Online text. ')
  await expect(editor(bea.page)).toContainText('Online text.', { timeout: 2000 })

  await bea.net.setOffline(true)
  await typeAtEnd(bea.page, 'Typed on the train. ')
  await expect(saveState(bea.page)).toHaveText('Offline: changes kept on this device')
  await typeAtEnd(ann.page, 'Meanwhile at the office. ')
  await bea.net.setOffline(false)

  await expect(saveState(bea.page)).toHaveText('Saved', { timeout: 15_000 })
  await expect(editor(ann.page)).toContainText('Typed on the train.', { timeout: 15_000 })
  for (const t of ['Online text.', 'Typed on the train.', 'Meanwhile at the office.']) await expect(editor(bea.page)).toContainText(t)
})

test('a restore while another tab is open brings that tab to the restored content', async ({ browser }) => {
  const { ann, bea, node, call } = await teamPage(browser, 'EDITOR')
  await typeAtEnd(ann.page, 'Version one. ')
  await expect(saveState(ann.page)).toHaveText('Saved')
  const v1 = await call(ann, `/api/nodes/${node.id}/versions`, { name: 'First draft' })
  await typeAtEnd(ann.page, 'Removed by the restore. ')
  await expect(editor(bea.page)).toContainText('Removed by the restore.', { timeout: 2000 })
  await expect(saveState(ann.page)).toHaveText('Saved')

  await call(ann, `/api/versions/${v1.id}/restore`)
  await expect(editor(bea.page)).not.toContainText('Removed by the restore.', { timeout: 10_000 })
  await expect(editor(bea.page)).toContainText('Version one.')
  await typeAtEnd(bea.page, 'After the restore. ') // and the reloaded tab edits live again
  await expect(saveState(bea.page)).toHaveText('Saved', { timeout: 10_000 })
})
