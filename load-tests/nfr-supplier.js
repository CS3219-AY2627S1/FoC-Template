// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the supplier NFR load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const serviceType = __ENV.LOAD_TEST_SERVICE_TYPE
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-supplier-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const ratePerSecond = Number(__ENV.NFR_SUPPLIER_RATE_PER_SEC ?? 50)
const duration = __ENV.NFR_SUPPLIER_DURATION ?? '5m'
const preAllocatedVUs = Number(__ENV.NFR_SUPPLIER_PREALLOCATED_VUS ?? 50)
const maxVUs = Number(__ENV.NFR_SUPPLIER_MAX_VUS ?? 100)
const p95Limit = Number(__ENV.NFR_SUPPLIER_P95_LIMIT_MS ?? 200)

export const options = {
  scenarios: {
    supplier_queries: {
      executor: 'constant-arrival-rate',
      rate: ratePerSecond,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{endpoint:supplier-query}': [`p(95)<${p95Limit}`],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

async function requiredCredential(value, secretName) {
  if (value) return value
  try {
    return await secrets.get(secretName)
  } catch {
    fail(`${secretName} must be set in the local environment or configured as a Grafana Cloud k6 secret.`)
  }
}

function sessionHeaders(session) {
  return { Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}` }
}

export async function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: await requiredCredential(__ENV.LOAD_TEST_USER_EMAIL, 'loadtestuseremail'),
      password: await requiredCredential(__ENV.LOAD_TEST_USER_PASSWORD, 'loadtestuserpassword'),
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth-login' } },
  )
  const loggedIn = check(response, {
    'supplier NFR login returns HTTP 200': (res) => res.status === 200,
    'supplier NFR login returns cookies': (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })
  if (!loggedIn) fail(`Supplier NFR login failed with HTTP ${response.status}.`)
  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export default function (session) {
  const query = serviceType === undefined
    ? 'status=operational'
    : `status=operational&serviceTypes=${encodeURIComponent(JSON.stringify([Number(serviceType)]))}`
  const response = http.get(`${baseUrl}/api/supplier?${query}`, {
    headers: sessionHeaders(session),
    tags: { endpoint: 'supplier-query' },
  })
  check(response, {
    'supplier query returns HTTP 200': (res) => res.status === 200,
    'supplier query returns an array': (res) => {
      try { return Array.isArray(res.json('suppliers')) } catch { return false }
    },
  })
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nSupplier NFR summary written to ${summaryPath}\n`,
  }
}
