/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Live User/Kafka/Credit/gateway browser journey for #65. Author review: Reviewed and approved by @phuc. */
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('member views only their credit transactions and filters Singapore dates responsively', async ({ page, request }, testInfo) => {
  const username = `credit_${randomUUID().slice(0, 8)}`
  const password = 'CreditHistoryPass1'
  const registered = await request.post('/api/v1/auth/register', { data: { username, email: `${username}@u.nus.edu`, password } })
  expect(registered.status()).toBe(201)
  const login = await request.post('/api/v1/auth/login', { data: { identifier: username, password } })
  expect(login.status()).toBe(200)
  const { accessToken } = await login.json()
  const headers = { Authorization: `Bearer ${accessToken}` }
  await expect.poll(async () => {
    const res = await request.get('/api/v1/me/credit/transactions', { headers })
    return res.ok() ? (await res.json()).totalItems : -1
  }, { timeout: 60000 }).toBe(1)
  const history = await (await request.get('/api/v1/me/credit/transactions', { headers })).json()
  const grant = history.items[0]
  expect(grant.type).toBe('INITIAL_GRANT')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(grant.createdAt))

  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/suppliers$/)
  await page.getByRole('link', { name: 'My credits' }).click()
  await expect(page.getByRole('heading', { name: 'Credit transactions', exact: true })).toBeVisible()
  await expect(page.getByText(grant.id, { exact: true })).toBeVisible()
  await expect(page.getByText('+100', { exact: true })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('group', { name: 'Current credit balance' }).getByText('100', { exact: true })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('group', { name: 'Current credit balance' }).getByText('0', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome credits' })).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('credit-desktop.png'), fullPage: true })

  await page.getByLabel('From date').fill(day)
  await page.getByLabel('To date').fill(day)
  await page.getByLabel('Per page').selectOption('50')
  const filtered = page.waitForResponse((res) => {
    const url = new URL(res.url())
    return url.pathname === '/api/v1/me/credit/transactions' && url.searchParams.get('from') === `${day}T00:00:00+08:00`
  })
  await page.getByRole('button', { name: 'Apply filters' }).click()
  expect((await filtered).status()).toBe(200)
  await expect(page.getByText(grant.id, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('From date')).toHaveValue(day)
  await expect(page.getByLabel('To date')).toHaveValue(day)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Welcome credits' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('credit-mobile.png'), fullPage: true })
  await page.getByLabel('From date').fill('2000-01-01')
  await page.getByLabel('To date').fill('2000-01-01')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('heading', { name: 'No transactions match these dates' })).toBeVisible()
  await page.getByRole('form', { name: 'Filter transactions' }).getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByText(grant.id, { exact: true })).toBeVisible()

  await page.goto('/credits?page=999')
  await expect(page.getByRole('heading', { name: 'No transactions on this page' })).toBeVisible()
  await page.getByRole('button', { name: 'First page' }).click()
  await expect(page.getByText(grant.id, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.goto('/credits')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
