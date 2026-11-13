// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the local load-test data provisioning script.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const flociUrl = (process.env.FLOCI_URL ?? 'http://localhost:4566').replace(/\/$/, '')
const outputPath = process.env.LOAD_TEST_ENV_FILE ?? 'load-tests/.env.generated'
const k6BaseUrl = process.env.LOAD_TEST_K6_BASE_URL ?? 'http://host.docker.internal:8080'
const supplierName = process.env.LOAD_TEST_SUPPLIER_NAME ?? 'Octobox'
const password = process.env.LOAD_TEST_SEED_PASSWORD ?? randomPassword()
const timeoutMs = Number(process.env.LOAD_TEST_PROVISION_TIMEOUT_MS ?? 30_000)

function randomPassword() {
  return `RelayK6-${randomBytes(8).toString('base64url')}aA1!`
}

function runId() {
  return `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toLowerCase()
}

async function request(url, init = {}) {
  const response = await fetch(url, init)
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }
  return { response, body, text }
}

function assertStatus(result, expected, description) {
  if (result.response.status !== expected) {
    const detail = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    throw new Error(`${description} failed with HTTP ${result.response.status}: ${detail}`)
  }
}

function cookieHeader(response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  const values = cookies
    .map((cookie) => cookie.split(';', 1)[0])
    .filter((cookie) => cookie.startsWith('relay_access=') || cookie.startsWith('relay_id='))
  if (values.length !== 2) throw new Error('Authentication response did not return relay_access and relay_id cookies.')
  return values.join('; ')
}

function uniqueIdentity(role, id) {
  return {
    email: `relay-k6-${role}-${id}@u.nus.edu`,
    username: `relayk6${role.replace(/[^a-z0-9]/gi, '')}${id}`,
  }
}

async function register(identity) {
  const result = await request(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: identity.email,
      password,
      passwordConfirmation: password,
    }),
  })
  assertStatus(result, 201, `Register ${identity.email}`)
}

async function readOtp(email) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await request(`${flociUrl}/_aws/ses`)
    assertStatus(result, 200, 'Read Floci SES messages')
    const messages = result.body?.messages ?? []
    const matching = messages.filter((message) =>
      message?.Destination?.ToAddresses?.includes(email),
    )
    const text = matching.at(-1)?.Body?.text_part ?? ''
    const code = text.match(/\b\d{6}\b/)?.[0]
    if (code) return code
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No verification code was received for ${email} within ${timeoutMs}ms.`)
}

async function verifyAndLogin(identity) {
  const code = await readOtp(identity.email)
  const result = await request(`${baseUrl}/api/auth/verification/confirm-and-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: identity.email, password, code }),
  })
  // Cognito may confirm the user before the auth service finishes validating
  // the returned tokens. If that final validation fails with a transient 500,
  // recover by logging in the now-confirmed account.
  const authenticated =
    result.response.status === 500
      ? await request(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: identity.email, password }),
        })
      : result
  assertStatus(authenticated, 200, `Verify ${identity.email}`)
  const cookie = cookieHeader(authenticated.response)
  const subject = authenticated.body?.data?.user?.subject
  if (typeof subject !== 'string' || !subject) {
    throw new Error(`Verification response for ${identity.email} did not contain a user subject.`)
  }
  return { ...identity, cookie, subject }
}

async function createProfile(user) {
  const result = await request(`${baseUrl}/api/user/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Cookie: user.cookie },
    body: JSON.stringify({ username: user.username }),
  })
  assertStatus(result, 200, `Create profile for ${user.email}`)
}

async function waitForCredit(user) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await request(`${baseUrl}/api/credit`, {
      headers: { Cookie: user.cookie },
    })
    if (result.response.status === 200 && Number.isFinite(result.body?.availableCredit)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Credit balance was not allocated for ${user.email} within ${timeoutMs}ms.`)
}

async function findSupplier(user) {
  const result = await request(`${baseUrl}/api/supplier?status=operational`, {
    headers: { Cookie: user.cookie },
  })
  assertStatus(result, 200, 'Find operational supplier')
  const supplier = (result.body?.suppliers ?? []).find(
    (candidate) => candidate?.name?.trim().toLowerCase() === supplierName.trim().toLowerCase(),
  )
  if (!supplier) throw new Error(`Supplier ${supplierName} was not found.`)
  if (!supplier.isOperational || !supplier.serviceTypes?.length) {
    throw new Error(`Supplier ${supplierName} is not operational or offers no service types.`)
  }
  return { id: supplier.id, serviceType: supplier.serviceTypes[0] }
}

async function createReadFixture(requester, supplier) {
  const result = await request(`${baseUrl}/api/errands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: requester.cookie },
    body: JSON.stringify({
      supplierDetails: {
        supplierId: supplier.id,
        supplierName,
        serviceType: supplier.serviceType,
      },
      name: `k6 read fixture ${runId()}`,
      pickupLocation: {
        lat: 1.2966,
        lng: 103.7764,
        buildingName: 'COM3',
        floorNumber: 2,
      },
      targetLocation: {
        lat: 1.2988,
        lng: 103.7731,
        buildingName: 'UTown',
        floorNumber: 1,
      },
      deliveryDetails: {
        description: 'Disposable fixture for read-only k6 testing.',
        instructions: 'Do not accept this fixture errand.',
      },
      creditAmount: Number(process.env.LOAD_TEST_FIXTURE_CREDIT_AMOUNT ?? '1'),
    }),
  })
  assertStatus(result, 201, 'Create read-test fixture errand')
  const errandId = result.body?.errand?.id
  if (typeof errandId !== 'string' || !errandId) {
    throw new Error('Create read-test fixture errand did not return an errand ID.')
  }
  return errandId
}

function envLine(name, value) {
  return `${name}=${String(value).replaceAll('\\n', '')}`
}

function configured(name, fallback) {
  return process.env[name] ?? fallback
}

async function main() {
  const id = runId()
  const requester = uniqueIdentity('requester', id)
  const courier = uniqueIdentity('courier-a', id)
  const courierB = uniqueIdentity('courier-b', id)

  for (const identity of [requester, courier, courierB]) await register(identity)
  const users = []
  for (const identity of [requester, courier, courierB]) {
    users.push(await verifyAndLogin(identity))
  }
  for (const user of users) await createProfile(user)
  await Promise.all(users.map(waitForCredit))
  const supplier = await findSupplier(users[0])
  const fixtureErrandId = await createReadFixture(users[0], supplier)

  await mkdir(outputPath.substring(0, outputPath.lastIndexOf('/')) || '.', { recursive: true })
  const content = [
    '# Generated for one disposable load-test run. Do not commit.',
    envLine('BASE_URL', k6BaseUrl),
    envLine('LOAD_TEST_USER_EMAIL', requester.email),
    envLine('LOAD_TEST_USER_PASSWORD', password),
    envLine('LOAD_TEST_REQUESTER_EMAIL', requester.email),
    envLine('LOAD_TEST_REQUESTER_PASSWORD', password),
    envLine('LOAD_TEST_COURIER_EMAIL', courier.email),
    envLine('LOAD_TEST_COURIER_PASSWORD', password),
    envLine('LOAD_TEST_COURIER_B_EMAIL', courierB.email),
    envLine('LOAD_TEST_COURIER_B_PASSWORD', password),
    envLine('LOAD_TEST_SUPPLIER_ID', supplier.id),
    envLine('LOAD_TEST_SERVICE_TYPE', supplier.serviceType),
    envLine('LOAD_TEST_CREDIT_AMOUNT', process.env.LOAD_TEST_CREDIT_AMOUNT ?? '1'),
    envLine('LOAD_TEST_ERRAND_ID', fixtureErrandId),
    envLine('LOAD_TEST_CLEANUP', process.env.LOAD_TEST_CLEANUP ?? 'true'),
    envLine('SMOKE_VUS', configured('SMOKE_VUS', '1')),
    envLine('SMOKE_DURATION', configured('SMOKE_DURATION', '30s')),
    envLine('LIFECYCLE_VUS', configured('LIFECYCLE_VUS', '1')),
    envLine('LIFECYCLE_ITERATIONS', configured('LIFECYCLE_ITERATIONS', '1')),
    envLine('LIFECYCLE_MAX_DURATION', configured('LIFECYCLE_MAX_DURATION', '2m')),
    envLine('SETTLEMENT_TIMEOUT_SECONDS', configured('SETTLEMENT_TIMEOUT_SECONDS', '30')),
    envLine('SETTLEMENT_POLL_SECONDS', configured('SETTLEMENT_POLL_SECONDS', '1')),
    envLine('NFR_START_VUS', configured('NFR_START_VUS', '10')),
    envLine('NFR_TARGET_VUS', configured('NFR_TARGET_VUS', '100')),
    envLine('NFR_RAMP_DURATION', configured('NFR_RAMP_DURATION', '1m')),
    envLine('NFR_HOLD_DURATION', configured('NFR_HOLD_DURATION', '5m')),
    envLine('NFR_RAMP_DOWN_DURATION', configured('NFR_RAMP_DOWN_DURATION', '1m')),
    envLine('NFR_THINK_TIME', configured('NFR_THINK_TIME', '1')),
    envLine('NFR_P95_LIMIT_MS', configured('NFR_P95_LIMIT_MS', '250')),
    envLine('NFR_AUTH_RATE_PER_MIN', configured('NFR_AUTH_RATE_PER_MIN', '500')),
    envLine('NFR_AUTH_DURATION', configured('NFR_AUTH_DURATION', '5m')),
    envLine('NFR_AUTH_PREALLOCATED_VUS', configured('NFR_AUTH_PREALLOCATED_VUS', '50')),
    envLine('NFR_AUTH_MAX_VUS', configured('NFR_AUTH_MAX_VUS', '100')),
    envLine('NFR_AUTH_P95_LIMIT_MS', configured('NFR_AUTH_P95_LIMIT_MS', '500')),
    envLine('NFR_SUPPLIER_RATE_PER_SEC', configured('NFR_SUPPLIER_RATE_PER_SEC', '50')),
    envLine('NFR_SUPPLIER_DURATION', configured('NFR_SUPPLIER_DURATION', '5m')),
    envLine('NFR_SUPPLIER_PREALLOCATED_VUS', configured('NFR_SUPPLIER_PREALLOCATED_VUS', '50')),
    envLine('NFR_SUPPLIER_MAX_VUS', configured('NFR_SUPPLIER_MAX_VUS', '100')),
    envLine('NFR_SUPPLIER_P95_LIMIT_MS', configured('NFR_SUPPLIER_P95_LIMIT_MS', '200')),
    envLine('NFR_CREDIT_RATE_PER_SEC', configured('NFR_CREDIT_RATE_PER_SEC', '10')),
    envLine('NFR_CREDIT_DURATION', configured('NFR_CREDIT_DURATION', '1m')),
    envLine('NFR_CREDIT_PREALLOCATED_VUS', configured('NFR_CREDIT_PREALLOCATED_VUS', '20')),
    envLine('NFR_CREDIT_MAX_VUS', configured('NFR_CREDIT_MAX_VUS', '100')),
    envLine('NFR_CREDIT_P95_LIMIT_MS', configured('NFR_CREDIT_P95_LIMIT_MS', '200')),
    envLine('NFR_ESTIMATION_RATE_PER_MIN', configured('NFR_ESTIMATION_RATE_PER_MIN', '15')),
    envLine('NFR_ESTIMATION_DURATION', configured('NFR_ESTIMATION_DURATION', '3m')),
    envLine('NFR_ESTIMATION_PREALLOCATED_VUS', configured('NFR_ESTIMATION_PREALLOCATED_VUS', '5')),
    envLine('NFR_ESTIMATION_MAX_VUS', configured('NFR_ESTIMATION_MAX_VUS', '20')),
    envLine('NFR_ESTIMATION_P95_LIMIT_MS', configured('NFR_ESTIMATION_P95_LIMIT_MS', '3500')),
    envLine('NFR_ESTIMATION_PER_USER_LIMIT', configured('NFR_ESTIMATION_PER_USER_LIMIT', '20')),
    envLine(
      'NFR_ESTIMATION_RATE_LIMIT_REQUESTS',
      configured('NFR_ESTIMATION_RATE_LIMIT_REQUESTS', '25'),
    ),
    envLine('NFR_ESTIMATION_RATE_LIMIT_VUS', configured('NFR_ESTIMATION_RATE_LIMIT_VUS', '5')),
    envLine(
      'NFR_ESTIMATION_RATE_LIMIT_MAX_DURATION',
      configured('NFR_ESTIMATION_RATE_LIMIT_MAX_DURATION', '1m'),
    ),
    envLine(
      'NFR_ESTIMATION_RATE_LIMIT_REJECTION_P95_MS',
      configured('NFR_ESTIMATION_RATE_LIMIT_REJECTION_P95_MS', '500'),
    ),
    envLine('NFR_MIXED_READ_TARGET_VUS', configured('NFR_MIXED_READ_TARGET_VUS', '90')),
    envLine('NFR_MIXED_READ_HOLD_DURATION', configured('NFR_MIXED_READ_HOLD_DURATION', '2m')),
    envLine('NFR_MIXED_WRITE_RATE_PER_MIN', configured('NFR_MIXED_WRITE_RATE_PER_MIN', '30')),
    envLine('NFR_MIXED_WRITE_DURATION', configured('NFR_MIXED_WRITE_DURATION', '2m')),
    envLine('NFR_MIXED_THINK_TIME', configured('NFR_MIXED_THINK_TIME', '1')),
    envLine('NFR_MIXED_READ_P95_LIMIT_MS', configured('NFR_MIXED_READ_P95_LIMIT_MS', '250')),
    envLine('NFR_MIXED_CREATE_P95_LIMIT_MS', configured('NFR_MIXED_CREATE_P95_LIMIT_MS', '250')),
    envLine('NFR_MIXED_CANCEL_P95_LIMIT_MS', configured('NFR_MIXED_CANCEL_P95_LIMIT_MS', '150')),
    '',
  ].join('\n')
  await writeFile(outputPath, content, 'utf8')
  console.log(`Provisioned three users, selected supplier ${supplier.id}, and created fixture errand ${fixtureErrandId}.`)
  console.log(`Generated k6 environment: ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
