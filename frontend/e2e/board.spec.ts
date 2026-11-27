import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'

// Live boards with two real users (two browser contexts) through the collaboration service.
// Needs the app on E2E_BASE_URL (default :8080) and the collaboration service it points to.
test.setTimeout(90_000)

interface Person { context: BrowserContext; page: Page }

const board = (page: Page) => page.locator('[data-board]')
/** The board's live (non-deleted) element types, sorted: the canvas itself has no DOM to read. */
const live = (page: Page) => board(page)
const hint = 'Draw with the pen, add shapes, or paste Mermaid code.'

async function post(request: APIRequestContext, context: BrowserContext, url: string, data?: unknown) {
  const token = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const res = await request.fetch(url, { method: 'POST', data, headers: { 'X-XSRF-TOKEN': token } })
  expect(res.ok(), `POST ${url} -> ${res.status()}`).toBeTruthy()
  return res.status() === 204 || !(await res.text()) ? null : res.json()
}

async function person(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: name, email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app') // sets the CSRF cookie
  return { context, page }
}

/** Ann makes a team board; Bea joins the team with `role`; both open it. */
async function teamBoard(browser: Browser, role: 'EDITOR' | 'VIEWER') {
  const ann = await person(browser, 'Ann Writer')
  const bea = await person(browser, 'Bea Second')
  const call = (p: Person, url: string, data?: unknown) => post(p.page.request, p.context, url, data)
  const team = await call(ann, '/api/teams', { teamName: 'Thesis group', teamDescription: '' })
  const space = await call(ann, `/api/teams/${team.id}/spaces`, { name: 'Chapters', description: '' })
  const node = await call(ann, `/api/spaces/${space.id}/nodes`, { title: 'Method sketch', type: 'BOARD' })
  const invite = await call(ann, `/api/teams/${team.id}/invite`)
  const request = await call(bea, `/api/team-invites/${invite.inviteCode}/join`)
  await call(ann, `/api/teams/${team.id}/join-requests/${request.id}/accept`, { role })
  for (const p of [ann, bea]) {
    await p.page.goto(`/app/b/${node.id}`)
    await expect(board(p.page)).toHaveAttribute('data-ready', 'true')
  }
  return { ann, bea }
}

type Tool = 'Rectangle' | 'Ellipse' | 'Draw'

/** Picks a tool from Excalidraw's toolbar and drags across the canvas (clear of the style panel on the left). */
async function draw(page: Page, tool: Tool, from: [number, number], to: [number, number]) {
  await page.getByRole('radio', { name: tool }).click({ force: true }) // the icon over the input is its label
  await drag(page, from, to)
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.locator('.excalidraw canvas.interactive').boundingBox())!
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + from[0] + ((to[0] - from[0]) * i) / 8, box.y + from[1] + ((to[1] - from[1]) * i) / 8)
  }
  await page.mouse.up()
}

test('both draw and see each other within 2 s', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await draw(bea.page, 'Draw', [680, 250], [780, 350])
  await expect(live(ann.page)).toHaveAttribute('data-live', 'freedraw,rectangle', { timeout: 2000 })
  await expect(live(bea.page)).toHaveAttribute('data-live', 'freedraw,rectangle')

  await expect(ann.page.locator('header [role="status"]')).toHaveText('Saved')
  await bea.page.reload() // stored by the service, not only passed along
  await expect(live(bea.page)).toHaveAttribute('data-live', 'freedraw,rectangle')
})

test('viewer sees live drawing and cannot draw', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'VIEWER')
  await expect(bea.page.getByText('View only')).toBeVisible()
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await expect(bea.page.getByRole('radio', { name: 'Rectangle' })).toHaveCount(0) // no drawing tools in view mode
  await bea.page.keyboard.press('r') // the shortcut does nothing either
  await drag(bea.page, [680, 250], [780, 350])
  await ann.page.waitForTimeout(1000)
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle')
  await expect(live(ann.page)).toHaveAttribute('data-live', 'rectangle')
})

test('undo in tab A keeps tab B’s shape', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(live(bea.page)).toHaveAttribute('data-live', 'rectangle', { timeout: 2000 })
  await draw(bea.page, 'Ellipse', [680, 250], [780, 350])
  await expect(live(ann.page)).toHaveAttribute('data-live', 'ellipse,rectangle', { timeout: 2000 })
  await ann.page.keyboard.press('Control+z')
  await expect(live(ann.page)).toHaveAttribute('data-live', 'ellipse')
  await expect(live(bea.page)).toHaveAttribute('data-live', 'ellipse', { timeout: 2000 })
  await ann.page.keyboard.press('Control+y')
  await expect(live(bea.page)).toHaveAttribute('data-live', 'ellipse,rectangle', { timeout: 2000 })
})

test('image paste is blocked', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await ann.page.locator('.excalidraw canvas.interactive').click({ position: { x: 600, y: 300 } })
  await ann.page.evaluate(async () => {
    const png = await (await fetch('/app/favicon-16.png')).blob()
    const data = new DataTransfer()
    data.items.add(new File([png], 'shot.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await ann.page.waitForTimeout(1000)
  for (const p of [ann, bea]) await expect(live(p.page)).toHaveAttribute('data-live', '')
})

test('empty hint disappears on first shape', async ({ browser }) => {
  const { ann, bea } = await teamBoard(browser, 'EDITOR')
  await expect(ann.page.getByText(hint)).toBeVisible()
  await draw(ann.page, 'Rectangle', [480, 250], [600, 330])
  await expect(ann.page.getByText(hint)).toHaveCount(0)
  await expect(bea.page.getByText(hint)).toHaveCount(0, { timeout: 2000 })
})
