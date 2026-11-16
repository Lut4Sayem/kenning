import { expect, test, type Page } from '@playwright/test'

// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Each test registers a fresh user.
async function openNewPage(page: Page) {
  const email = `read-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { fullName: 'Reading Tester', email, password: 'password123' } })).ok()).toBeTruthy()
  expect((await page.request.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy()
  await page.goto('/app/')
  await page.getByRole('button', { name: /new page/i }).first().click()
  await page.waitForURL(/\/app\/p\//)
  await page.locator('.bn-editor[contenteditable="true"]').click()
}

/** WCAG contrast of an element's text colour against the first non-transparent background behind it. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    let bg: number[] = [255, 255, 255]
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor)
      if (c.length === 3 || c[3] > 0) { bg = c.slice(0, 3); break }
    }
    const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

test('QA-19: code block text is readable (contrast >= 4.5:1)', async ({ page }) => {
  await openNewPage(page)
  await page.keyboard.type('``` ')
  await page.keyboard.type('def attention(q, k, v):')
  const code = '.bn-block-content[data-content-type="codeBlock"] code'
  await expect(page.locator(code)).toHaveText('def attention(q, k, v):')
  expect(await contrastOf(page, code)).toBeGreaterThanOrEqual(4.5)

  // The text colours from the formatting toolbar, on white (a probe next to the editor, so the page content is untouched).
  for (const colour of ['gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']) {
    await page.locator('.bn-root').first().evaluate((root, c) => {
      root.querySelector('#probe')?.remove()
      root.insertAdjacentHTML('beforeend', `<span id="probe" data-text-color="${c}">x</span>`)
    }, colour)
    expect(await contrastOf(page, '#probe'), colour).toBeGreaterThanOrEqual(4.5)
  }
})
