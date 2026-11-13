// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-03
// Scope: Generated initial implementation of the AWS load-test data provisioning script.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)

const baseUrl = required('BASE_URL').replace(/\/$/, '')
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'
const profile = process.env.AWS_PROFILE
const userPoolId = required('COGNITO_USER_POOL_ID')
const outputPath = process.env.LOAD_TEST_ENV_FILE ?? 'load-tests/.env.aws.generated'
const supplierName = process.env.LOAD_TEST_SUPPLIER_NAME ?? 'Octobox'
const timeoutMs = Number(process.env.LOAD_TEST_PROVISION_TIMEOUT_MS ?? 30_000)
const emailDomain = process.env.LOAD_TEST_EMAIL_DOMAIN ?? 'u.nus.edu'
const fixtureCreditAmount = Number(process.env.LOAD_TEST_FIXTURE_CREDIT_AMOUNT ?? '1')

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be set.`)
  return value
}

function randomPassword() {
  return `RelayAwsK6-${randomBytes(10).toString('base64url')}aA1!`
}

function runId() {
  return `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toLowerCase()
}

function username(role, id) {
  return `relayk6${role}${id}`.replace(/[^a-z0-9]/gi, '').slice(0, 50)
}

function identity(role, id) {
  const suffix = `${role}-${id}`
  return {
    email: `relay-aws-${suffix}@${emailDomain}`,
    username: username(role, id),
    password: randomPassword(),
  }
}

async function aws(args) {
  const common = ['--region', region]
  if (profile) common.push('--profile', profile)
  try {
    const result = await execFileAsync('aws', [...args, ...common, '--output', 'json'], {
      maxBuffer: 2 * 1024 * 1024,
    })
    return result.stdout.trim() ? JSON.parse(result.stdout) : undefined
  } catch (error) {
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message
    const wrapped = new Error(`AWS CLI failed: ${detail}`)
    wrapped.cause = error
    throw wrapped
  }
}

async function userExists(email) {
  try {
    await aws(['cognito-idp', 'admin-get-user', '--user-pool-id', userPoolId, '--username', email])
    return true
  } catch (error) {
    if (/UserNotFoundException|does not exist/i.test(error.message)) return false
    throw error
  }
}

async function provisionCognitoUser(user) {
  if (await userExists(user.email)) {
    await aws([
      'cognito-idp', 'admin-update-user-attributes',
      '--user-pool-id', userPoolId,
      '--username', user.email,
      '--user-attributes', 'Name=email_verified,Value=true',
    ])
  } else {
    await aws([
      'cognito-idp', 'admin-create-user',
      '--user-pool-id', userPoolId,
      '--username', user.email,
      '--user-attributes', `Name=email,Value=${user.email}`, 'Name=email_verified,Value=true',
      '--message-action', 'SUPPRESS',
    ])
  }
  await aws([
    'cognito-idp', 'admin-set-user-password',
    '--user-pool-id', userPoolId,
    '--username', user.email,
    '--password', user.password,
    '--permanent',
  ])
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
  if (values.length !== 2) throw new Error('Login did not return relay_access and relay_id cookies.')
  return values.join('; ')
}

async function login(user) {
  const result = await request(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  })
  assertStatus(result, 200, `Login ${user.email}`)
  return { ...user, cookie: cookieHeader(result.response) }
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
    const result = await request(`${baseUrl}/api/credit`, { headers: { Cookie: user.cookie } })
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
      name: `k6 AWS read fixture ${runId()}`,
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
        description: 'Disposable fixture for AWS k6 read testing.',
        instructions: 'Do not accept this fixture errand.',
      },
      creditAmount: fixtureCreditAmount,
    }),
  })
  assertStatus(result, 201, 'Create AWS read-test fixture errand')
  const errandId = result.body?.errand?.id
  if (typeof errandId !== 'string' || !errandId) {
    throw new Error('Create AWS read-test fixture errand did not return an errand ID.')
  }
  return errandId
}

function envLine(name, value) {
  return `${name}=${String(value).replaceAll('\n', '')}`
}

function configured(name, fallback) {
  const value = process.env[name]?.trim()
  return value || fallback
}

async function main() {
  const id = runId()
  const requester = identity('requester', id)
  const courier = identity('couriera', id)
  const courierB = identity('courierb', id)
  const users = [requester, courier, courierB]

  console.log(`Provisioning AWS Cognito users in ${userPoolId}...`)
  for (const user of users) await provisionCognitoUser(user)

  console.log('Logging in through the deployed ALB...')
  const authenticated = []
  for (const user of users) authenticated.push(await login(user))

  console.log('Creating Relay profiles...')
  for (const user of authenticated) await createProfile(user)

  console.log('Waiting for asynchronous credit allocation...')
  await Promise.all(authenticated.map(waitForCredit))

  const supplier = await findSupplier(authenticated[0])
  console.log('Creating a disposable AWS read-test errand...')
  const fixtureErrandId = await createReadFixture(authenticated[0], supplier)
  await mkdir(dirname(outputPath), { recursive: true })
  const content = [
    '# Generated for one AWS load-test run. Do not commit.',
    envLine('BASE_URL', baseUrl),
    envLine('LOAD_TEST_USER_EMAIL', requester.email),
    envLine('LOAD_TEST_USER_PASSWORD', requester.password),
    envLine('LOAD_TEST_REQUESTER_EMAIL', requester.email),
    envLine('LOAD_TEST_REQUESTER_PASSWORD', requester.password),
    envLine('LOAD_TEST_COURIER_EMAIL', courier.email),
    envLine('LOAD_TEST_COURIER_PASSWORD', courier.password),
    envLine('LOAD_TEST_COURIER_B_EMAIL', courierB.email),
    envLine('LOAD_TEST_COURIER_B_PASSWORD', courierB.password),
    envLine('LOAD_TEST_SUPPLIER_ID', supplier.id),
    envLine('LOAD_TEST_SERVICE_TYPE', supplier.serviceType),
    envLine('LOAD_TEST_CREDIT_AMOUNT', process.env.LOAD_TEST_CREDIT_AMOUNT ?? '1'),
    envLine('LOAD_TEST_FIXTURE_CREDIT_AMOUNT', fixtureCreditAmount),
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
  console.log(`Provisioned requester and two couriers; selected supplier ${supplier.id}; created fixture errand ${fixtureErrandId}.`)
  console.log(`Generated AWS k6 environment: ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
