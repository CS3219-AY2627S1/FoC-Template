/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added real-browser member and administrator Supplier journeys against
 * the disposable live Compose stack for issue #31.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: Added live mobile form/confirmation, backend validation, two-editor
 * stale-ETag recovery, and missing-precondition evidence for issue #34.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: Added browser regressions for sticky navigation and aligned time fields.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-11-09.
 * Scope: Updated issue #64's stale Supplier detail assertion to verify the existing
 * errand action and exact Supplier preselection URL. Author review: PENDING.
 */
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

const memberUsername = requiredEnvironment('SUPPLIER_UI_MEMBER_USERNAME')
const memberEmail = requiredEnvironment('SUPPLIER_UI_MEMBER_EMAIL')
const memberPassword = requiredEnvironment('SUPPLIER_UI_MEMBER_PASSWORD')
const adminUsername = requiredEnvironment('SUPPLIER_UI_ADMIN_USERNAME')
const adminPassword = requiredEnvironment('SUPPLIER_UI_ADMIN_PASSWORD')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  await createMember(request)
})

test('MEMBER browses, searches, filters, sorts, pages and views live Suppliers responsively', async ({ page }, testInfo) => {
  await login(page, memberUsername, memberPassword)

  await expect(page).toHaveURL(/\/suppliers$/)
  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(page.getByText('21 results')).toBeVisible()
  await expect(page.getByRole('link', { name: /Manage Suppliers|Manage/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add Supplier' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page, 'desktop member catalogue')
  await assertStickyNavigation(page)

  await page.getByRole('searchbox', { name: 'Search name or location' }).fill('printer')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/q=printer/)
  await expect(page.getByRole('link', { name: 'Printer @ Com 2', exact: true })).toBeVisible()
  await expect(page.getByText('1 result')).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Building').selectOption('CENTRAL_LIBRARY')
  await expect(page).toHaveURL(/buildingCode=CENTRAL_LIBRARY/)
  await expect(page.getByText(/result/)).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Category').selectOption('PRINTING')
  await expect(page).toHaveURL(/category=PRINTING/)
  await expect(page.getByRole('link', { name: 'Printer @ Com 2', exact: true })).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Sort by').selectOption('name,desc')
  await expect(page).toHaveURL(/sort=name%2Cdesc/)
  await expect(page.getByText('21 results')).toBeVisible()
  await expect(page.locator('article h2').first()).toHaveText('he by He Brews')

  await clearFilters(page)
  await expect(page.getByRole('navigation', { name: 'Supplier catalogue pages' })).toContainText('Page 1 of 2')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/page=1/)
  await expect(page.getByRole('navigation', { name: 'Supplier catalogue pages' })).toContainText('Page 2 of 2')

  const firstPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === '/api/v1/suppliers'
      && url.searchParams.get('page') === '0'
  })
  await page.getByRole('button', { name: 'Previous' }).click()
  await firstPageResponse
  await expect(page.getByRole('navigation', { name: 'Supplier catalogue pages' })).toContainText('Page 1 of 2')
  const firstSupplierCard = page.locator('article').first()
  await expect(firstSupplierCard).toBeVisible()
  const firstSupplierName = await firstSupplierCard.locator('h2').innerText()
  await firstSupplierCard.getByRole('link', { name: `View details for ${firstSupplierName}` }).click()
  await expect(page.getByRole('heading', { name: firstSupplierName, exact: true })).toBeVisible()
  await expect(page.getByText('Typical hours', { exact: true })).toBeVisible()
  await expect(page.getByText('Coordinates', { exact: true })).toBeVisible()
  await assertNoHorizontalOverflow(page, 'desktop member detail')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/suppliers')
  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Manage Suppliers|Manage/ })).toHaveCount(0)
  await assertNoHorizontalOverflow(page, 'mobile member catalogue')
  await captureEvidence(page, testInfo, 'member-mobile-catalogue.png')

  await page.getByRole('link', { name: /View details for/ }).first().click()
  const requestErrandLink = page.getByRole('link', { name: 'Request an errand from here', exact: true })
  await expect(requestErrandLink).toBeVisible()
  const supplierId = new URL(page.url()).pathname.split('/').at(-1)
  await expect(requestErrandLink).toHaveAttribute('href', `/errands/new?supplierId=${supplierId}`)
  await assertNoHorizontalOverflow(page, 'mobile member detail')
})

test('ADMINISTRATOR handles responsive forms, validation, concurrency and lifecycle actions', async ({ page, request }, testInfo) => {
  const createdName = 'Browser Verification Cafe'
  const firstEditorName = 'Browser Verification Hub A'
  const secondEditorDraft = 'Browser Verification Hub B draft'

  await login(page, adminUsername, adminPassword)
  await expect(page.getByRole('link', { name: 'Manage Suppliers' })).toBeVisible()
  await page.getByRole('link', { name: 'Manage Suppliers' }).click()
  await expect(page.getByRole('heading', { name: 'Supplier management' })).toBeVisible()
  await assertNoHorizontalOverflow(page, 'desktop administrator management')

  await page.getByRole('link', { name: 'Add Supplier' }).click()
  await expect(page.getByRole('heading', { name: 'Add Supplier' })).toBeVisible()
  await page.getByRole('radio', { name: 'Typical hours', exact: true }).check()
  await assertTimeControlsAligned(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoHorizontalOverflow(page, 'mobile administrator create form')
  await page.getByLabel('Supplier name').fill(createdName)
  await page.getByLabel('Building').selectOption('COM3')
  await page.getByRole('checkbox', { name: 'Food' }).check()
  await page.getByLabel('Location description').fill('Level 1 beside the browser verification desk')
  await page.getByLabel('Floor (optional)').fill('1')
  await page.getByRole('radio', { name: 'Open all day' }).check()

  // Deliberately alter the rendered select to prove that backend validation is
  // authoritative even if a browser client submits a value absent from metadata.
  await page.getByLabel('Building').evaluate((element) => {
    const select = element as HTMLSelectElement
    select.add(new Option('Unsupported test building', 'NOT_FROM_METADATA'))
    select.value = 'NOT_FROM_METADATA'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const validationResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/v1/suppliers'
      && response.status() === 400,
  )
  await page.getByRole('button', { name: 'Create Supplier' }).click()
  const validationResponse = await validationResponsePromise
  await expect(page.getByText('Select a supported Building Code.')).toBeVisible()
  await expect(page.getByLabel('Supplier name')).toHaveValue(createdName)
  await expect(page.getByLabel('Location description')).toHaveValue('Level 1 beside the browser verification desk')
  expect(await validationResponse.json()).toMatchObject({
    code: 'SUPPLIER_VALIDATION_FAILED',
    fieldErrors: { buildingCode: 'Select a supported Building Code.' },
  })

  await page.getByLabel('Building').selectOption('COM3')
  await page.getByRole('button', { name: 'Create Supplier' }).click()

  await expect(page).toHaveURL(/\/suppliers\/admin/)
  const createdCard = page.locator('article').filter({ has: page.getByRole('heading', { name: createdName, exact: true }) })
  await expect(createdCard).toBeVisible()
  const supplierHref = await createdCard.getByRole('link', { name: 'View' }).getAttribute('href')
  expect(supplierHref).toMatch(/^\/suppliers\/[0-9a-f-]+$/)
  const supplierId = supplierHref!.split('/').at(-1)!
  const detailApiPath = `/api/v1/suppliers/${supplierId}`
  const editPath = `${supplierHref}/edit`

  const firstDetailPromise = page.waitForResponse((response) => isSupplierDetailResponse(response.url(), response.request().method(), detailApiPath))
  await createdCard.getByRole('link', { name: 'Edit' }).click()
  const firstDetailResponse = await firstDetailPromise
  await expect(page.getByRole('heading', { name: 'Edit Supplier' })).toBeVisible()
  await assertNoHorizontalOverflow(page, 'mobile administrator edit form')
  await page.getByLabel('Supplier name').fill(firstEditorName)
  await page.getByLabel('Location description').fill('Level 2 beside the first editor desk')

  const secondEditor = await page.context().newPage()
  await login(secondEditor, adminUsername, adminPassword)
  const secondDetailPromise = secondEditor.waitForResponse((response) =>
    isSupplierDetailResponse(response.url(), response.request().method(), detailApiPath),
  )
  await secondEditor.goto(editPath)
  const secondDetailResponse = await secondDetailPromise
  await expect(secondEditor.getByRole('heading', { name: 'Edit Supplier' })).toBeVisible()
  const originalEtag = firstDetailResponse.headers().etag
  expect(originalEtag).toMatch(/^"v\d+"$/)
  expect(secondDetailResponse.headers().etag).toBe(originalEtag)
  await secondEditor.getByLabel('Supplier name').fill(secondEditorDraft)
  await secondEditor.getByLabel('Location description').fill('Unsaved second editor location')

  await page.getByRole('button', { name: 'Save changes' }).click()

  const editedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: firstEditorName, exact: true }) })
  await expect(editedCard).toBeVisible()
  await expect(editedCard).toContainText('Level 2 beside the first editor desk')
  await expect(editedCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)

  const staleResponsePromise = secondEditor.waitForResponse((response) =>
    response.request().method() === 'PUT'
      && new URL(response.url()).pathname === detailApiPath
      && response.status() === 412,
  )
  await secondEditor.getByRole('button', { name: 'Save changes' }).click()
  await staleResponsePromise
  await expect(secondEditor.getByText('This Supplier changed on the server')).toBeVisible()
  await expect(secondEditor.getByLabel('Supplier name')).toHaveValue(secondEditorDraft)
  await expect(secondEditor.getByLabel('Location description')).toHaveValue('Unsaved second editor location')
  await secondEditor.getByRole('button', { name: 'Compare with latest' }).click()
  await expect(secondEditor.getByRole('heading', { name: 'Your draft compared with latest' })).toBeVisible()
  await expect(secondEditor.getByText(firstEditorName)).toBeVisible()
  await secondEditor.getByRole('button', { name: 'Reload latest' }).click()
  await expect(secondEditor.getByLabel('Supplier name')).toHaveValue(firstEditorName)
  await secondEditor.close()

  const token = await page.evaluate(() => window.sessionStorage.getItem('foc.accessToken'))
  expect(token).toBeTruthy()
  const missingPrecondition = await request.put(detailApiPath, {
    headers: { Authorization: `Bearer ${token}` },
    data: supplierMutation(firstEditorName, 'Level 2 beside the first editor desk'),
  })
  const missingPreconditionBody = await missingPrecondition.json()
  expect(missingPrecondition.status(), JSON.stringify(missingPreconditionBody)).toBe(428)
  expect(missingPreconditionBody).toMatchObject({ code: 'SUPPLIER_PRECONDITION_REQUIRED' })

  await editedCard.getByRole('button', { name: 'Archive' }).click()
  const archiveDialog = page.getByRole('alertdialog', { name: 'Archive Supplier?' })
  await expect(archiveDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await assertNoHorizontalOverflow(page, 'mobile archive confirmation')
  await page.keyboard.press('Escape')
  await expect(archiveDialog).toHaveCount(0)
  await editedCard.getByRole('button', { name: 'Archive' }).click()
  await archiveDialog.getByRole('button', { name: 'Archive Supplier' }).click()
  await expect(editedCard).toHaveCount(0)

  await page.getByRole('button', { name: 'Archived' }).click()
  const archivedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: firstEditorName, exact: true }) })
  await expect(archivedCard).toBeVisible()
  await expect(archivedCard).toContainText('ARCHIVED')
  await expect(archivedCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)
  await captureEvidence(page, testInfo, 'administrator-archived-view.png')

  await archivedCard.getByRole('button', { name: 'Restore' }).click()
  const restoreDialog = page.getByRole('alertdialog', { name: 'Restore Supplier?' })
  await expect(restoreDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await assertNoHorizontalOverflow(page, 'mobile restore confirmation')
  await restoreDialog.getByRole('button', { name: 'Restore Supplier' }).click()
  await expect(archivedCard).toHaveCount(0)

  await page.getByRole('button', { name: 'Active' }).click()
  const restoredCard = page.locator('article').filter({ has: page.getByRole('heading', { name: firstEditorName, exact: true }) })
  await expect(restoredCard).toBeVisible()
  await expect(restoredCard).toContainText('ACTIVE')
  await expect(restoredCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)
  await assertNoHorizontalOverflow(page, 'mobile administrator management')
})

function isSupplierDetailResponse(url: string, method: string, path: string): boolean {
  return method === 'GET' && new URL(url).pathname === path
}

function supplierMutation(name: string, locationDescription: string) {
  return {
    name,
    categories: ['FOOD'],
    buildingCode: 'COM3',
    floor: '1',
    locationDescription,
    latitude: null,
    longitude: null,
    hoursKind: 'ALL_DAY',
  }
}

async function createMember(request: APIRequestContext) {
  const response = await request.post('/api/v1/auth/register', {
    data: { username: memberUsername, email: memberEmail, password: memberPassword },
  })
  expect(response.status(), await response.text()).toBe(201)
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/suppliers$/)
}

async function clearFilters(page: Page) {
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/suppliers$/)
  await expect(page.getByText('21 results')).toBeVisible()
}

async function assertNoHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  expect(dimensions.documentScrollWidth, `${context}: document overflow`).toBeLessThanOrEqual(dimensions.documentClientWidth)
  expect(dimensions.bodyScrollWidth, `${context}: body overflow`).toBeLessThanOrEqual(dimensions.bodyClientWidth)
}

async function assertStickyNavigation(page: Page) {
  const header = page.getByRole('banner')
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect.poll(async () => (await header.boundingBox())?.y).toBe(0)
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function assertTimeControlsAligned(page: Page) {
  const [opensAt, closesAt] = await Promise.all([
    page.getByLabel('Opens at').boundingBox(),
    page.getByLabel('Closes at').boundingBox(),
  ])
  expect(opensAt).not.toBeNull()
  expect(closesAt).not.toBeNull()
  expect(Math.abs(opensAt!.y - closesAt!.y)).toBeLessThanOrEqual(1)
}

async function captureEvidence(page: Page, testInfo: TestInfo, filename: string) {
  await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true })
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required. Run npm run test:e2e.`)
  return value
}
