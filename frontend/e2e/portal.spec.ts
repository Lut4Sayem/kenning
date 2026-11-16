import { expect, test } from '@playwright/test'

// Needs the full app on E2E_BASE_URL (default :8080) with Mongo behind it. Registers a fresh user through the UI.
test.setTimeout(90_000)

test('register, create team, create space, create page, comment', async ({ page }) => {
  const email = `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  await page.goto('/app/register')
  await page.getByLabel('Full name').fill('Portal Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByLabel('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Register signs them in and lands on Home with a welcome (QA-01).
  await expect(page).toHaveURL(/\/app\/?$/)
  await expect(page.getByText('Welcome to Kenning, Portal')).toBeVisible()
  await page.getByRole('button', { name: 'New team' }).click() // the + beside "Your teams" in the sidebar
  await page.getByLabel('Team name').fill('Portal Team')
  await page.getByRole('button', { name: 'Create team' }).click()

  await expect(page.getByRole('heading', { name: 'Portal Team', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'New space' }).click()
  await page.getByLabel('Space name').fill('Portal Space')
  await page.getByRole('button', { name: 'Create space' }).click()
  await expect(page.getByRole('main').getByRole('link', { name: /Portal Space/ })).toBeVisible() // the sidebar lists it too

  await page.getByRole('button', { name: 'New page in Portal Space' }).click()
  await expect(page).toHaveURL(/\/app\/p\//)

  await page.getByLabel('Write a comment').fill('First comment')
  await page.getByRole('button', { name: 'Send comment' }).click()
  await expect(page.getByText('First comment')).toBeVisible()
})
