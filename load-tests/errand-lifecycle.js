// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the errand lifecycle load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const requesterEmail = __ENV.LOAD_TEST_REQUESTER_EMAIL
const requesterPassword = __ENV.LOAD_TEST_REQUESTER_PASSWORD
const courierEmail = __ENV.LOAD_TEST_COURIER_EMAIL
const courierPassword = __ENV.LOAD_TEST_COURIER_PASSWORD
const supplierId = __ENV.LOAD_TEST_SUPPLIER_ID
const serviceType = Number(__ENV.LOAD_TEST_SERVICE_TYPE ?? 0)
const creditAmount = Number(__ENV.LOAD_TEST_CREDIT_AMOUNT ?? 1)
const settlementTimeoutSeconds = Number(__ENV.SETTLEMENT_TIMEOUT_SECONDS ?? 30)
const settlementPollSeconds = Number(__ENV.SETTLEMENT_POLL_SECONDS ?? 1)
const cleanup = (__ENV.LOAD_TEST_CLEANUP ?? 'true') !== 'false'
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/errand-lifecycle-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const lifecycleIterationsStarted = new Counter('lifecycle_iterations_started')
const lifecycleComplete = new Rate('lifecycle_complete')

export const options = {
  scenarios: {
    lifecycle: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.LIFECYCLE_VUS ?? 1),
      iterations: Number(__ENV.LIFECYCLE_ITERATIONS ?? 1),
      maxDuration: __ENV.LIFECYCLE_MAX_DURATION ?? '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
    lifecycle_iterations_started: ['count>0'],
    lifecycle_complete: ['rate==1'],
    'http_req_duration{endpoint:errand-create}': ['p(95)<2000'],
    'http_req_duration{endpoint:errand-confirm}': ['p(95)<2000'],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

function required(value, name) {
  if (!value) fail(`${name} must be provided as a k6 environment variable.`)
  return value
}

async function requiredCredential(value, name) {
  if (value) return value

  try {
    return await secrets.get(name)
  } catch {
    fail(`${name} must be set in the local environment or configured as a Grafana Cloud k6 secret.`)
  }
}

function requiredInteger(value, name, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    fail(`${name} must be an integer greater than or equal to ${minimum}.`)
  }
  return value
}

function sessionHeaders(session) {
  return { Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}` }
}

function responseJson(response) {
  try {
    return response.json()
  } catch {
    return undefined
  }
}

function expect(response, name, predicate) {
  const passed = check(response, { [name]: predicate })
  if (!passed) {
    const body = responseJson(response)
    fail(`${name} failed with HTTP ${response.status}: ${body ? JSON.stringify(body) : response.body}`)
  }
  return response
}

function login(email, password, role) {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email: required(email, `LOAD_TEST_${role}_EMAIL`), password: required(password, `LOAD_TEST_${role}_PASSWORD`) }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: `auth-login-${role.toLowerCase()}` } },
  )

  expect(response, `${role.toLowerCase()} login returns HTTP 200`, (res) => res.status === 200)
  expect(response, `${role.toLowerCase()} login returns both authentication cookies`, (res) =>
    Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  )

  const body = responseJson(response)
  const subject = body?.data?.user?.subject
  if (typeof subject !== 'string' || !subject) fail(`${role} login response does not contain a user subject.`)

  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
    subject,
  }
}

function getCreditBalance(session, role) {
  const response = http.get(`${baseUrl}/api/credit`, {
    headers: sessionHeaders(session),
    tags: { endpoint: `credit-balance-${role}` },
  })
  expect(response, `${role} credit balance returns HTTP 200`, (res) => res.status === 200)

  const balance = responseJson(response)
  expect(response, `${role} credit balance is non-negative`, () =>
    Number.isFinite(balance?.availableCredit) &&
    Number.isFinite(balance?.reserveCredit) &&
    balance.availableCredit >= 0 &&
    balance.reserveCredit >= 0,
  )
  return balance
}

function requireProfile(session, role) {
  const response = http.get(`${baseUrl}/api/user/me`, {
    headers: sessionHeaders(session),
    tags: { endpoint: `profile-check-${role}` },
  })
  expect(response, `${role} profile exists`, (res) => {
    const profile = responseJson(res)?.data
    return res.status === 200 && profile?.profileCreated === true
  })
}

function getSupplier(requester) {
  const response = http.get(`${baseUrl}/api/supplier/${encodeURIComponent(required(supplierId, 'LOAD_TEST_SUPPLIER_ID'))}`, {
    headers: sessionHeaders(requester),
    tags: { endpoint: 'supplier-detail' },
  })
  expect(response, 'configured supplier returns HTTP 200', (res) => res.status === 200)

  const supplier = responseJson(response)?.supplier
  expect(response, 'configured supplier is operational and offers the configured service type', () =>
    supplier?.isOperational === true && Array.isArray(supplier?.serviceTypes) && supplier.serviceTypes.includes(serviceType),
  )
  return supplier
}

function postErrand(session, id, action, expectedStatus, endpoint) {
  const response = http.post(`${baseUrl}/api/errands/${encodeURIComponent(id)}/${action}`, null, {
    headers: sessionHeaders(session),
    tags: { endpoint },
  })
  expect(response, `${action} returns HTTP 200`, (res) => res.status === 200)
  expect(response, `${action} changes status to ${expectedStatus}`, (res) => responseJson(res)?.errand?.status === expectedStatus)
  return responseJson(response).errand
}

function transferRecorded(session, errandId, senderId, receiverId, endpoint) {
  const response = http.get(`${baseUrl}/api/credit/history?offset=0`, {
    headers: sessionHeaders(session),
    tags: { endpoint },
  })
  if (response.status !== 200) return false

  const records = responseJson(response)?.records
  return (
    Array.isArray(records) &&
    records.some(
      (record) =>
        record?.reference?.service === 'errand' &&
        record.reference.id === errandId &&
        record.reference.type === 'CREDIT_TRANSFER' &&
        record.senderId === senderId &&
        record.receiverId === receiverId &&
        record.amount === creditAmount,
    )
  )
}

function waitForSettlement(requester, courier, errandId) {
  const deadline = Date.now() + settlementTimeoutSeconds * 1000
  while (Date.now() < deadline) {
    const requesterRecorded = transferRecorded(
      requester,
      errandId,
      requester.subject,
      courier.subject,
      'credit-history-requester',
    )
    const courierRecorded = transferRecorded(
      courier,
      errandId,
      requester.subject,
      courier.subject,
      'credit-history-courier',
    )
    if (requesterRecorded && courierRecorded) return true
    sleep(settlementPollSeconds)
  }
  return false
}

export async function setup() {
  requiredInteger(serviceType, 'LOAD_TEST_SERVICE_TYPE')
  requiredInteger(creditAmount, 'LOAD_TEST_CREDIT_AMOUNT', 1)
  requiredInteger(settlementTimeoutSeconds, 'SETTLEMENT_TIMEOUT_SECONDS', 1)
  if (!Number.isFinite(settlementPollSeconds) || settlementPollSeconds <= 0) {
    fail('SETTLEMENT_POLL_SECONDS must be greater than zero.')
  }

  const requester = login(
    await requiredCredential(requesterEmail, 'loadtestrequesteremail'),
    await requiredCredential(requesterPassword, 'loadtestrequesterpassword'),
    'REQUESTER',
  )
  const courier = login(
    await requiredCredential(courierEmail, 'loadtestcourieremail'),
    await requiredCredential(courierPassword, 'loadtestcourierpassword'),
    'COURIER',
  )
  if (requester.subject === courier.subject) fail('Requester and courier must be different users.')

  requireProfile(requester, 'requester')
  requireProfile(courier, 'courier')
  const requesterBalance = getCreditBalance(requester, 'requester')
  getCreditBalance(courier, 'courier')
  if (requesterBalance.availableCredit < creditAmount) {
    fail(`Requester needs at least ${creditAmount} available credits for this test.`)
  }

  return { requester, courier, supplier: getSupplier(requester) }
}

export default function ({ requester, courier, supplier }) {
  lifecycleIterationsStarted.add(1)
  const uniqueSuffix = `${Date.now()}-vu${__VU}-iter${__ITER}`
  const created = http.post(
    `${baseUrl}/api/errands`,
    JSON.stringify({
      supplierDetails: { supplierId: supplier.id, supplierName: supplier.name, serviceType },
      name: `k6 lifecycle ${uniqueSuffix}`,
      pickupLocation: supplier.location,
      targetLocation: {
        lat: supplier.location.lat + 0.0001,
        lng: supplier.location.lng + 0.0001,
        buildingName: `k6 target ${uniqueSuffix}`,
        floorNumber: 1,
      },
      deliveryDetails: { description: `k6 lifecycle delivery ${uniqueSuffix}` },
      creditAmount,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    {
      headers: { ...sessionHeaders(requester), 'Content-Type': 'application/json' },
      tags: { endpoint: 'errand-create' },
    },
  )
  expect(created, 'create errand returns HTTP 201', (res) => res.status === 201)
  expect(created, 'created errand is OPEN', (res) => responseJson(res)?.errand?.status === 'OPEN')

  const errandId = responseJson(created)?.errand?.id
  if (typeof errandId !== 'string' || !errandId) fail('Create errand response does not contain an errand ID.')

  postErrand(courier, errandId, 'accept', 'ACCEPTED', 'errand-accept')
  postErrand(courier, errandId, 'pickup', 'PICKED_UP', 'errand-pickup')
  const delivered = postErrand(courier, errandId, 'deliver', 'DELIVERED', 'errand-deliver')
  if (!delivered.confirmationDeadline) fail('Delivered errand must have a confirmation deadline.')
  postErrand(requester, errandId, 'confirm', 'CONFIRMED', 'errand-confirm')

  const settled = waitForSettlement(requester, courier, errandId)
  lifecycleComplete.add(settled)
  if (!settled) fail(`Credit transfer for errand ${errandId} was not recorded within ${settlementTimeoutSeconds} seconds.`)

  getCreditBalance(requester, 'requester after settlement')
  getCreditBalance(courier, 'courier after settlement')

  if (cleanup) {
    const deleted = http.del(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}`, null, {
      headers: sessionHeaders(requester),
      tags: { endpoint: 'errand-delete' },
    })
    expect(deleted, 'confirmed errand cleanup returns HTTP 204', (res) => res.status === 204)
  }
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data

  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nErrand lifecycle summary written to ${summaryPath}\n`,
  }
}
