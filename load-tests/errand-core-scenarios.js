// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the errand core-scenarios load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const supplierId = __ENV.LOAD_TEST_SUPPLIER_ID
const serviceType = Number(__ENV.LOAD_TEST_SERVICE_TYPE ?? 0)
const creditAmount = Number(__ENV.LOAD_TEST_CREDIT_AMOUNT ?? 1)
const settlementTimeoutSeconds = Number(__ENV.SETTLEMENT_TIMEOUT_SECONDS ?? 30)
const cleanup = (__ENV.LOAD_TEST_CLEANUP ?? 'true') !== 'false'
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/errand-core-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const acceptanceWinners = new Counter('acceptance_winners')
const createScenarioStarted = new Counter('create_scenario_started')
const acceptanceRaceStarted = new Counter('acceptance_race_started')
const creditGuardStarted = new Counter('credit_guard_started')
const settlementsComplete = new Rate('settlements_complete')

// 404/409/422 are intentional outcomes in the race and credit-guard tests.
// Configure this at init time so it applies to every VU, not only setup().
http.setResponseCallback(http.expectedStatuses(200, 201, 204, 404, 409, 422))

export const options = {
  scenarios: {
    create: { executor: 'per-vu-iterations', vus: 1, iterations: 1, startTime: '0s', exec: 'createScenario' },
    acceptanceRace: { executor: 'per-vu-iterations', vus: 1, iterations: 1, startTime: '8s', exec: 'acceptanceRaceScenario' },
    creditGuards: { executor: 'per-vu-iterations', vus: 1, iterations: 1, startTime: '16s', exec: 'creditGuardScenario' },
  },
  thresholds: {
    checks: ['rate==1'],
    create_scenario_started: ['count>0'],
    acceptance_race_started: ['count>0'],
    credit_guard_started: ['count>0'],
    acceptance_winners: ['count==1'],
    settlements_complete: ['rate==1'],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

function json(response) {
  try { return response.json() } catch { return undefined }
}

function expect(response, name, predicate) {
  const passed = check(response, { [name]: predicate })
  if (!passed) {
    const body = json(response)
    fail(`${name} failed with HTTP ${response.status}: ${body ? JSON.stringify(body) : response.body}`)
  }
  return response
}

async function secretOrEnv(value, secretName, envName) {
  if (value) return value
  try { return await secrets.get(secretName) } catch {
    fail(`${envName} must be supplied locally or configured as a Grafana Cloud k6 secret.`)
  }
}

function headers(session, contentType = false) {
  return {
    Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  }
}

function login(email, password, label) {
  const response = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' }, tags: { endpoint: `auth-login-${label}` },
  })
  expect(response, `${label} login succeeds`, (res) => res.status === 200)
  expect(response, `${label} login returns both authentication cookies`, (res) =>
    Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  )
  const subject = json(response)?.data?.user?.subject
  if (!subject) fail(`${label} login did not return a user subject.`)
  return {
    accessToken: response.cookies.relay_access?.[0]?.value,
    idToken: response.cookies.relay_id?.[0]?.value,
    subject,
  }
}

function requireProfile(session, label) {
  const response = http.get(`${baseUrl}/api/user/me`, {
    headers: headers(session),
    tags: { endpoint: `profile-check-${label}` },
  })
  expect(response, `${label} profile exists`, (res) => {
    const profile = json(res)?.data
    return res.status === 200 && profile?.profileCreated === true
  })
}

function supplierFor(requester) {
  const response = http.get(`${baseUrl}/api/supplier/${encodeURIComponent(supplierId)}`, {
    headers: headers(requester), tags: { endpoint: 'supplier-detail' },
  })
  expect(response, 'configured supplier is available', (res) => res.status === 200)
  const supplier = json(response)?.supplier
  expect(response, 'supplier is operational and offers service type', () =>
    supplier?.isOperational === true && Array.isArray(supplier?.serviceTypes) && supplier.serviceTypes.includes(serviceType))
  return supplier
}

function payload(supplier, suffix, amount = creditAmount) {
  return {
    supplierDetails: { supplierId: supplier.id, supplierName: supplier.name, serviceType },
    name: `k6 core ${suffix}`,
    pickupLocation: supplier.location,
    targetLocation: {
      lat: supplier.location.lat + 0.0001,
      lng: supplier.location.lng + 0.0001,
      buildingName: `k6 target ${suffix}`,
      floorNumber: 1,
    },
    deliveryDetails: { description: `k6 core delivery ${suffix}` },
    creditAmount: amount,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
}

function create(requester, supplier, suffix, amount = creditAmount) {
  const response = http.post(`${baseUrl}/api/errands`, JSON.stringify(payload(supplier, suffix, amount)), {
    headers: headers(requester, true), tags: { endpoint: 'errand-create' },
  })
  return response
}

function action(session, id, name, endpoint) {
  return http.post(`${baseUrl}/api/errands/${encodeURIComponent(id)}/${name}`, '', {
    headers: headers(session), tags: { endpoint },
  })
}

function balance(session, label) {
  const response = http.get(`${baseUrl}/api/credit`, { headers: headers(session), tags: { endpoint: `credit-balance-${label}` } })
  expect(response, `${label} credit balance is available`, (res) => res.status === 200)
  const value = json(response)
  expect(response, `${label} credit balances never become negative`, () =>
    Number.isFinite(value?.availableCredit) && Number.isFinite(value?.reserveCredit) &&
    value.availableCredit >= 0 && value.reserveCredit >= 0)
  return value
}

function history(session, endpoint) {
  const response = http.get(`${baseUrl}/api/credit/history?offset=0`, {
    headers: headers(session), tags: { endpoint },
  })
  return response.status === 200 ? json(response)?.records ?? [] : []
}

function transferCount(session, errandId, requester, courier) {
  return history(session, 'credit-history').filter((record) =>
    record?.reference?.service === 'errand' && record.reference.id === errandId &&
    record.reference.type === 'CREDIT_TRANSFER' && record.senderId === requester &&
    record.receiverId === courier && record.amount === creditAmount).length
}

function waitForTransfer(requester, courier, errandId) {
  const deadline = Date.now() + settlementTimeoutSeconds * 1000
  while (Date.now() < deadline) {
    if (transferCount(requester, errandId, requester.subject, courier.subject) === 1 &&
        transferCount(courier, errandId, requester.subject, courier.subject) === 1) return true
    sleep(1)
  }
  return false
}

function cleanupErrand(requester, courier, errandId, status) {
  if (!cleanup) return
  if (status === 'ACCEPTED') {
    const dropped = action(courier, errandId, 'drop', 'errand-drop-cleanup')
    check(dropped, { 'accepted errand cleanup drop returns HTTP 200': (res) => res.status === 200 })
  }
  if (status === 'OPEN' || status === 'ACCEPTED') {
    const cancelled = action(requester, errandId, 'cancel', 'errand-cancel-cleanup')
    check(cancelled, { 'errand cleanup cancel returns HTTP 200': (res) => res.status === 200 })
  }
  if (status === 'CANCELLED' || status === 'CONFIRMED') {
    const deleted = http.del(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}`, '', {
      headers: headers(requester), tags: { endpoint: 'errand-delete-cleanup' },
    })
    check(deleted, { 'errand cleanup delete returns HTTP 204': (res) => res.status === 204 })
  }
}

export async function setup() {
  if (!supplierId) fail('LOAD_TEST_SUPPLIER_ID must be provided as a k6 environment variable.')
  if (!Number.isInteger(serviceType) || serviceType < 0) fail('LOAD_TEST_SERVICE_TYPE must be a non-negative integer.')
  if (!Number.isInteger(creditAmount) || creditAmount < 1) fail('LOAD_TEST_CREDIT_AMOUNT must be at least 1.')
  const requester = login(
    await secretOrEnv(__ENV.LOAD_TEST_REQUESTER_EMAIL, 'loadtestrequesteremail', 'LOAD_TEST_REQUESTER_EMAIL'),
    await secretOrEnv(__ENV.LOAD_TEST_REQUESTER_PASSWORD, 'loadtestrequesterpassword', 'LOAD_TEST_REQUESTER_PASSWORD'), 'requester')
  const courierA = login(
    await secretOrEnv(__ENV.LOAD_TEST_COURIER_EMAIL, 'loadtestcourieremail', 'LOAD_TEST_COURIER_EMAIL'),
    await secretOrEnv(__ENV.LOAD_TEST_COURIER_PASSWORD, 'loadtestcourierpassword', 'LOAD_TEST_COURIER_PASSWORD'), 'courier-a')
  const courierB = login(
    await secretOrEnv(__ENV.LOAD_TEST_COURIER_B_EMAIL, 'loadtestcourierbemail', 'LOAD_TEST_COURIER_B_EMAIL'),
    await secretOrEnv(__ENV.LOAD_TEST_COURIER_B_PASSWORD, 'loadtestcourierbpassword', 'LOAD_TEST_COURIER_B_PASSWORD'), 'courier-b')
  if (requester.subject === courierA.subject) fail('Requester and courier must be different users.')
  if (requester.subject === courierB.subject || courierA.subject === courierB.subject) fail('Requester and both couriers must be different users.')
  requireProfile(requester, 'requester')
  requireProfile(courierA, 'courier-a')
  requireProfile(courierB, 'courier-b')
  const supplier = supplierFor(requester)
  balance(requester, 'requester-before')
  balance(courierA, 'courier-before')
  return { requester, courierA, courierB, supplier }
}

export function createScenario(data) {
  createScenarioStarted.add(1)
  const suffix = `create-${Date.now()}`
  const before = balance(data.requester, 'requester-create-before')
  const created = create(data.requester, data.supplier, suffix)
  expect(created, 'create scenario returns HTTP 201', (res) => res.status === 201)
  const errandId = json(created)?.errand?.id
  if (!errandId) fail('Create scenario did not return an errand ID.')
  const detail = http.get(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}`, {
    headers: headers(data.requester), tags: { endpoint: 'errand-detail' },
  })
  expect(detail, 'created errand can be retrieved', (res) => res.status === 200 && json(res)?.errand?.id === errandId)
  expect(created, 'created errand reserves credits', (res) => json(res)?.errand?.status === 'OPEN')
  const after = balance(data.requester, 'requester-create-after')
  check(null, { 'create scenario reserves the requested credits': () =>
    after.availableCredit === before.availableCredit - creditAmount &&
    after.reserveCredit === before.reserveCredit + creditAmount })
  cleanupErrand(data.requester, data.courierA, errandId, 'OPEN')
}

export function acceptanceRaceScenario(data) {
  acceptanceRaceStarted.add(1)
  const suffix = `race-${Date.now()}`
  const created = create(data.requester, data.supplier, suffix)
  expect(created, 'race errand is created', (res) => res.status === 201)
  const errandId = json(created)?.errand?.id
  const responses = http.batch([
    {
      method: 'POST',
      url: `${baseUrl}/api/errands/${errandId}/accept`,
      body: '',
      params: { headers: headers(data.courierA), tags: { endpoint: 'errand-accept-race-a' } },
    },
    {
      method: 'POST',
      url: `${baseUrl}/api/errands/${errandId}/accept`,
      body: '',
      params: { headers: headers(data.courierB), tags: { endpoint: 'errand-accept-race-b' } },
    },
  ])
  const successes = responses.filter((res) => res.status === 200).length
  console.log(`Acceptance race responses: ${responses.map((res) => `${res.status} ${res.body}`).join(' | ')}`)
  acceptanceWinners.add(successes)
  check(responses, { 'acceptance race has exactly one winner': () => successes === 1 })
  check(responses, { 'losing acceptance is rejected': () => responses.some((res) => res.status === 409 || res.status === 404) })
  const detail = http.get(`${baseUrl}/api/errands/${errandId}`, { headers: headers(data.requester), tags: { endpoint: 'errand-race-detail' } })
  expect(detail, 'race leaves one assigned courier', (res) => res.status === 200 && Boolean(json(res)?.errand?.courierSub))
  if (cleanup) {
    const winningCourier = responses[0].status === 200 ? data.courierA : data.courierB
    const dropped = action(winningCourier, errandId, 'drop', 'errand-drop-race-cleanup')
    check(dropped, { 'race cleanup drops the winning courier': (res) => res.status === 200 })
    const cancelled = action(data.requester, errandId, 'cancel', 'errand-cancel-race-cleanup')
    check(cancelled, { 'race cleanup cancel returns HTTP 200': (res) => res.status === 200 })
    const deleted = http.del(`${baseUrl}/api/errands/${errandId}`, '', {
      headers: headers(data.requester), tags: { endpoint: 'errand-delete-race-cleanup' },
    })
    check(deleted, { 'race cleanup delete returns HTTP 204': (res) => res.status === 204 })
  }
}

export function creditGuardScenario(data) {
  creditGuardStarted.add(1)
  const suffix = `credit-${Date.now()}`
  const before = balance(data.requester, 'requester-credit-guard-before')
  const failed = create(data.requester, data.supplier, `${suffix}-insufficient`, 1_000_000_000)
  expect(failed, 'insufficient-credit reservation is rejected', (res) => res.status === 422)
  const afterFailed = balance(data.requester, 'requester-after-failed-reservation')
  check(null, { 'failed reservation does not make balance negative': () => afterFailed.availableCredit >= 0 && afterFailed.reserveCredit >= 0 })
  check(null, { 'failed reservation leaves requester balance unchanged': () =>
    afterFailed.availableCredit === before.availableCredit && afterFailed.reserveCredit === before.reserveCredit })

  const created = create(data.requester, data.supplier, suffix)
  expect(created, 'credit guard errand is created', (res) => res.status === 201)
  const errandId = json(created)?.errand?.id
  expect(action(data.courierA, errandId, 'accept', 'errand-accept-credit-guard'), 'credit guard acceptance succeeds', (res) => res.status === 200)
  expect(action(data.courierA, errandId, 'pickup', 'errand-pickup-credit-guard'), 'credit guard pickup succeeds', (res) => res.status === 200)
  expect(action(data.courierA, errandId, 'deliver', 'errand-deliver-credit-guard'), 'credit guard delivery succeeds', (res) => res.status === 200)
  expect(action(data.requester, errandId, 'confirm', 'errand-confirm-credit-guard'), 'first confirmation succeeds', (res) => res.status === 200)
  expect(action(data.requester, errandId, 'confirm', 'errand-confirm-duplicate'), 'duplicate confirmation is rejected', (res) => res.status === 409)
  const settled = waitForTransfer(data.requester, data.courierA, errandId)
  settlementsComplete.add(settled)
  if (!settled) fail('Credit settlement was not recorded within the configured timeout.')
  check(null, { 'credit transfer occurs exactly once': () =>
    transferCount(data.requester, errandId, data.requester.subject, data.courierA.subject) === 1 })
  balance(data.requester, 'requester-credit-guard-after')
  balance(data.courierA, 'courier-credit-guard-after')
  if (cleanup) {
    const deleted = http.del(`${baseUrl}/api/errands/${errandId}`, '', {
      headers: headers(data.requester), tags: { endpoint: 'errand-delete-credit-guard' },
    })
    check(deleted, { 'credit guard cleanup delete returns HTTP 204': (res) => res.status === 204 })
  }
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return { [summaryPath]: JSON.stringify(safeData, null, 2), stdout: `\nCore scenario summary written to ${summaryPath}\n` }
}
