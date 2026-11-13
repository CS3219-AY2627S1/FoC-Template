// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the credit NFR load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-credit-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const ratePerSecond = Number(__ENV.NFR_CREDIT_RATE_PER_SEC ?? 10)
const duration = __ENV.NFR_CREDIT_DURATION ?? '1m'
const preAllocatedVUs = Number(__ENV.NFR_CREDIT_PREALLOCATED_VUS ?? 20)
const maxVUs = Number(__ENV.NFR_CREDIT_MAX_VUS ?? 100)
const p95Limit = Number(__ENV.NFR_CREDIT_P95_LIMIT_MS ?? 200)

export const options = {
  scenarios: {
    credit_balance_load: {
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
    'http_req_duration{endpoint:credit-balance}': [`p(95)<${p95Limit}`],
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
    'credit NFR login returns HTTP 200': (res) => res.status === 200,
    'credit NFR login returns cookies': (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })
  if (!loggedIn) fail(`Credit NFR login failed with HTTP ${response.status}.`)
  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export default function (session) {
  const response = http.get(`${baseUrl}/api/credit`, {
    headers: sessionHeaders(session),
    tags: { endpoint: 'credit-balance' },
  })
  let balance
  try { balance = response.json() } catch { balance = undefined }
  check(response, {
    'credit balance returns HTTP 200': (res) => res.status === 200,
    'credit balances never become negative': () =>
      Number.isFinite(balance?.availableCredit) && Number.isFinite(balance?.reserveCredit) &&
      balance.availableCredit >= 0 && balance.reserveCredit >= 0,
  })
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nCredit NFR summary written to ${summaryPath}\n`,
  }
}
