// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the mixed errand NFR load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail, sleep } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const supplierId = __ENV.LOAD_TEST_SUPPLIER_ID
const fixtureErrandId = __ENV.LOAD_TEST_ERRAND_ID
const serviceType = Number(__ENV.LOAD_TEST_SERVICE_TYPE ?? 0)
const creditAmount = Number(__ENV.LOAD_TEST_CREDIT_AMOUNT ?? 1)
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-errand-mixed-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const readTargetVUs = Number(__ENV.NFR_MIXED_READ_TARGET_VUS ?? 90)
const readHold = __ENV.NFR_MIXED_READ_HOLD_DURATION ?? '2m'
const writeRatePerMinute = Number(__ENV.NFR_MIXED_WRITE_RATE_PER_MIN ?? 30)
const writeDuration = __ENV.NFR_MIXED_WRITE_DURATION ?? '2m'
const readP95Limit = Number(__ENV.NFR_MIXED_READ_P95_LIMIT_MS ?? __ENV.NFR_MIXED_P95_LIMIT_MS ?? __ENV.NFR_P95_LIMIT_MS ?? 250)
const createP95Limit = Number(__ENV.NFR_MIXED_CREATE_P95_LIMIT_MS ?? 250)
const cancelP95Limit = Number(__ENV.NFR_MIXED_CANCEL_P95_LIMIT_MS ?? 150)
const cleanup = (__ENV.LOAD_TEST_CLEANUP ?? 'true') !== 'false'

http.setResponseCallback(http.expectedStatuses(200, 201, 204))

export const options = {
  scenarios: {
    reads: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: readTargetVUs },
        { duration: readHold, target: readTargetVUs },
        { duration: '30s', target: 0 },
      ],
      exec: 'readScenario',
    },
    writes: {
      executor: 'constant-arrival-rate',
      rate: writeRatePerMinute,
      timeUnit: '1m',
      duration: writeDuration,
      preAllocatedVUs: 2,
      maxVUs: 10,
      startTime: '30s',
      exec: 'writeScenario',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{endpoint:mixed-visible}': [`p(95)<${readP95Limit}`],
    'http_req_duration{endpoint:mixed-detail}': [`p(95)<${readP95Limit}`],
    'http_req_duration{endpoint:mixed-create}': [`p(95)<${createP95Limit}`],
    'http_req_duration{endpoint:mixed-cancel}': [`p(95)<${cancelP95Limit}`],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

async function requiredCredential(value, secretName) {
  if (value) return value
  try { return await secrets.get(secretName) } catch {
    fail(`${secretName} must be set in the local environment or configured as a Grafana Cloud k6 secret.`)
  }
}

function headers(session, json = false) {
  return {
    Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

function body(response) {
  try { return response.json() } catch { return undefined }
}

function location(suffix) {
  return { lat: 1.2966, lng: 103.7764, buildingName: `k6 ${suffix}`, floorNumber: 1 }
}

function expect(response, name, predicate) {
  const passed = check(response, { [name]: predicate })
  if (!passed) fail(`${name} failed with HTTP ${response.status}: ${response.body}`)
  return response
}

export async function setup() {
  if (!supplierId) fail('LOAD_TEST_SUPPLIER_ID must be provided.')
  if (!fixtureErrandId) fail('LOAD_TEST_ERRAND_ID must be provided by the test-data provisioner.')
  if (!Number.isInteger(serviceType) || serviceType < 0) fail('LOAD_TEST_SERVICE_TYPE must be a non-negative integer.')
  if (!Number.isInteger(creditAmount) || creditAmount < 1) fail('LOAD_TEST_CREDIT_AMOUNT must be at least 1.')

  const login = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: await requiredCredential(__ENV.LOAD_TEST_REQUESTER_EMAIL ?? __ENV.LOAD_TEST_USER_EMAIL, 'loadtestrequesteremail'),
      password: await requiredCredential(__ENV.LOAD_TEST_REQUESTER_PASSWORD ?? __ENV.LOAD_TEST_USER_PASSWORD, 'loadtestrequesterpassword'),
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth-login' } },
  )
  expect(login, 'mixed NFR login returns HTTP 200', (res) => res.status === 200)
  return {
    accessToken: login.cookies.relay_access[0].value,
    idToken: login.cookies.relay_id[0].value,
  }
}

export function readScenario(session) {
  const list = http.get(`${baseUrl}/api/errands?scope=visible`, {
    headers: headers(session), tags: { endpoint: 'mixed-visible' },
  })
  expect(list, 'mixed visible errands return HTTP 200', (res) => res.status === 200)
  let errands = []
  try { errands = list.json('errands') ?? [] } catch { /* check below records failure */ }
  check(list, { 'mixed visible errands return an array': () => Array.isArray(errands) })

  // Use the provisioned read fixture rather than the first list result. The
  // write scenario creates/cancels/deletes its own errands concurrently, so a
  // list result could disappear before its detail request is sent.
  const detail = http.get(`${baseUrl}/api/errands/${encodeURIComponent(fixtureErrandId)}`, {
    headers: headers(session), tags: { endpoint: 'mixed-detail' },
  })
  expect(detail, 'mixed errand detail returns HTTP 200', (res) => res.status === 200)
  sleep(Number(__ENV.NFR_MIXED_THINK_TIME ?? 1))
}

export function writeScenario(session) {
  const suffix = `${Date.now()}-${__VU}-${__ITER}`
  const created = http.post(`${baseUrl}/api/errands`, JSON.stringify({
    supplierDetails: { supplierId, supplierName: 'Octobox', serviceType },
    name: `k6 mixed ${suffix}`,
    pickupLocation: location(`pickup ${suffix}`),
    targetLocation: location(`target ${suffix}`),
    deliveryDetails: { description: `Disposable k6 mixed workload errand ${suffix}` },
    creditAmount,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }), { headers: headers(session, true), tags: { endpoint: 'mixed-create' } })
  if (created.status !== 201) {
    check(created, { 'mixed errand creation returns HTTP 201': (res) => res.status === 201 })
    return
  }
  const id = body(created)?.errand?.id
  check(created, { 'mixed errand creation returns an ID': () => Boolean(id) })
  if (!id) return

  const cancelled = http.post(`${baseUrl}/api/errands/${encodeURIComponent(id)}/cancel`, '', {
    headers: headers(session), tags: { endpoint: 'mixed-cancel' },
  })
  check(cancelled, { 'mixed errand cancellation returns HTTP 200': (res) => res.status === 200 })

  if (cleanup && cancelled.status === 200) {
    const deleted = http.del(`${baseUrl}/api/errands/${encodeURIComponent(id)}`, '', {
      headers: headers(session), tags: { endpoint: 'mixed-delete' },
    })
    check(deleted, { 'mixed errand cleanup delete returns HTTP 204': (res) => res.status === 204 })
  }
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nErrand mixed NFR summary written to ${summaryPath}\n`,
  }
}
