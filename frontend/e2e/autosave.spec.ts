import { expect, test, type Page } from '@playwright/test'
import { realNetwork } from './network'

// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Each test registers a fresh user.
async function openNewPage(page: Page): Promise<string> {
  const email = `autosave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const register = await page.request.post('/api/auth/register', { data: { fullName: 'Autosave Tester', email, password: 'password123' } })
  expect(register.ok()).toBeTruthy()
  const login = await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })
  expect(login.ok()).toBeTruthy()
  await page.goto('/app')
  const newPageButton = page.getByRole('button', { name: /new page/i }).first()
  await expect(newPageButton).toBeEnabled() // disabled until the spaces load, and press() does not wait for that
  await newPageButton.press('Enter') // a new user only has the private space
  await page.waitForURL(/\/app\/p\//)
  await expect(editor(page)).toBeVisible()
  return page.url()
}

const editor = (page: Page) => page.locator('.bn-editor')
const saveState = (page: Page) => page.locator('header [role="status"]')

/** The local copy (IndexedDB) holds `text`: writes are asynchronous, so a tab closed a few ms after typing may miss them. */
async function untilKept(page: Page, text: string) {
  await expect.poll(() => page.evaluate(async () => {
    const req = indexedDB.open('keyval-store')
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result) })
    const all: unknown[] = await new Promise((r) => { const q = db.transaction('keyval').objectStore('keyval').getAll(); q.onsuccess = () => r(q.result) })
    return JSON.stringify(all)
  })).toContain(text)
}

async function typeInEditor(page: Page, text: string) {
  // The editor may be rebuilt (losing focus) once the live session says what this user may do: click first.
  await page.locator('.bn-editor[contenteditable="true"]').click()
  await page.keyboard.type(text)
}

test('type, wait for "Saved", reload, text is there', async ({ page }) => {
  const puts: string[] = []
  page.on('request', (r) => r.method() === 'PUT' && r.url().endsWith('/content') && puts.push(r.url()))
  await openNewPage(page)
  await expect(saveState(page)).toHaveText('Saved')

  await typeInEditor(page, 'Hello autosave')
  await expect(saveState(page)).toHaveText('Saving…')
  await expect(saveState(page)).toHaveText('Saved') // the collaboration service stored it
  expect(puts).toHaveLength(0) // the browser never writes page content itself

  await page.reload()
  await expect(editor(page)).toContainText('Hello autosave')
  await expect(saveState(page)).toHaveText('Saved')
})

test('offline edits are kept on the device and replayed on the next open', async ({ page, context }) => {
  const net = await realNetwork(context)
  const url = await openNewPage(page)
  await typeInEditor(page, 'Before offline')
  await expect(saveState(page)).toHaveText('Saved')

  await net.setOffline(true)
  await page.keyboard.type(' and typed offline')
  await expect(saveState(page)).toHaveText('Offline: changes kept on this device')
  await untilKept(page, 'Before offline and typed offline')
  await page.close() // the tab dies without ever reaching the server

  await net.setOffline(false)
  const again = await context.newPage()
  // The browser frees a closed tab's Web Lock a moment later; until then its copy counts as a live tab's and is
  // (rightly) left alone. A person reopens later than that, so wait for it, on a light page of the same origin.
  await again.goto('/app/favicon.svg')
  await expect.poll(() => again.evaluate(async () => ((await navigator.locks.query()).held ?? []).length)).toBe(0)
  await again.goto(url)
  await expect(editor(again)).toContainText('Before offline and typed offline')
  await expect(saveState(again)).toHaveText('Saved')
  await again.reload() // and now it really is on the server
  await expect(editor(again)).toContainText('Before offline and typed offline')
})

// Two tabs of one user edit the same page live: each sees the other's text.
test('two tabs on one page: both edits end up in the page', async ({ page, context }) => {
  const url = await openNewPage(page) // brand-new page: neither tab has anything from the server yet
  const second = await context.newPage()
  await second.goto(url)
  await expect(saveState(second)).toHaveText('Saved')

  await typeInEditor(page, 'From the first tab. ')
  await expect(saveState(page)).toHaveText('Saved')

  await typeInEditor(second, 'From the second tab. ')
  await expect(saveState(second)).toHaveText('Saved')
  await expect(second.getByRole('alert')).toHaveCount(0) // no question to answer any more
  await expect(editor(second)).toContainText('From the first tab.') // the first tab's text arrived here
  await expect(editor(second)).toContainText('From the second tab.')

  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('First again. ')
  await expect(saveState(page)).toHaveText('Saved')
  for (const text of ['From the first tab.', 'From the second tab.', 'First again.']) await expect(editor(page)).toContainText(text)

  await second.reload()
  for (const text of ['From the first tab.', 'From the second tab.', 'First again.']) await expect(editor(second)).toContainText(text)
})

test('logging out sends unsaved local copies first, or asks before dropping them', async ({ page, context }) => {
  const net = await realNetwork(context)
  const email = `logout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const login = () => context.request.post('/api/auth/login', { data: { email, password: 'password123' } })
  expect((await context.request.post('/api/auth/register', { data: { fullName: 'Logout Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await login()).ok()).toBeTruthy()
  await page.goto('/app')
  const newPageButton = page.getByRole('button', { name: /new page/i }).first()
  await expect(newPageButton).toBeEnabled() // disabled until the spaces load, and press() does not wait for that
  await newPageButton.press('Enter')
  await page.waitForURL(/\/app\/p\//)
  const url = page.url()
  await typeInEditor(page, 'Saved normally. ')
  await expect(saveState(page)).toHaveText('Saved')
  await expect(editor(page)).toContainText('Saved normally.')

  // Typed offline, then the tab is closed: the text now exists only in this browser.
  await net.setOffline(true)
  await page.keyboard.type('Typed offline. ')
  await expect(saveState(page)).toHaveText('Offline: changes kept on this device')
  await untilKept(page, 'Saved normally. Typed offline.')
  await page.close()

  // The live session cannot be joined: the copy cannot be sent, so logging out asks. "Cancel" keeps the session and the copy.
  await net.setOffline(false)
  await context.route('**/api/nodes/*/collab-ticket', (route) => route.abort()) // before the app starts: it sends kept copies at once
  const home = await context.newPage()
  await home.goto('/app')
  const accountMenu = home.getByRole('button', { name: 'Account menu' })
  const logOut = async () => {
    await accountMenu.click()
    await home.getByRole('menuitem', { name: 'Log out' }).click()
  }
  await expect(accountMenu).toBeVisible()
  await logOut()
  const question = home.getByRole('dialog', { name: 'Log out anyway?' })
  await expect(question).toContainText('You have unsaved changes on 1 page')
  await question.getByRole('button', { name: 'Stay logged in' }).click()
  await expect(question).toBeHidden()
  await expect(accountMenu).toBeVisible() // still here
  expect((await context.request.get('/api/me')).ok()).toBeTruthy() // and still logged in

  // Reachable again: the copy is sent during logout, no question.
  await context.unroute('**/api/nodes/*/collab-ticket')
  await logOut()
  await home.waitForURL(/\/app\/login/)

  // Nothing is left in the browser, yet the text is in the page: it was sent, not dropped.
  expect((await login()).ok()).toBeTruthy()
  await home.goto(url)
  await expect(editor(home)).toContainText('Saved normally. Typed offline.')
  await expect(saveState(home)).toHaveText('Saved')
})

test('slash menu inserts a status chip and Ctrl+Z removes it', async ({ page }) => {
  await openNewPage(page)
  await typeInEditor(page, '/status')
  await page.getByRole('option', { name: /Status/ }).click()
  await expect(editor(page).locator('.kf-status')).toHaveText('Status')

  await editor(page).locator('.kf-status button').click()
  await page.getByRole('radio', { name: 'green' }).click()
  await expect(editor(page).locator('span.kf-status--green')).toBeVisible()

  await editor(page).click()
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect(editor(page).locator('.kf-status')).toHaveCount(0)
})
