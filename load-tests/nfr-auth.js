// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the auth NFR load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-auth-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const ratePerMinute = Number(__ENV.NFR_AUTH_RATE_PER_MIN ?? 500)
const duration = __ENV.NFR_AUTH_DURATION ?? '5m'
const preAllocatedVUs = Number(__ENV.NFR_AUTH_PREALLOCATED_VUS ?? 50)
const maxVUs = Number(__ENV.NFR_AUTH_MAX_VUS ?? 100)
const p95Limit = Number(__ENV.NFR_AUTH_P95_LIMIT_MS ?? 500)

export const options = {
  scenarios: {
    authentication_load: {
      executor: 'constant-arrival-rate',
      rate: ratePerMinute,
      timeUnit: '1m',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{endpoint:auth-login}': [`p(95)<${p95Limit}`],
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

export async function setup() {
  return {
    email: await requiredCredential(__ENV.LOAD_TEST_USER_EMAIL, 'loadtestuseremail'),
    password: await requiredCredential(__ENV.LOAD_TEST_USER_PASSWORD, 'loadtestuserpassword'),
  }
}

export default function (credentials) {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email: credentials.email, password: credentials.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth-login' },
    },
  )

  check(response, {
    'login returns HTTP 200': (res) => res.status === 200,
    'login returns relay access cookie': (res) => Boolean(res.cookies.relay_access?.[0]?.value),
    'login returns relay ID cookie': (res) => Boolean(res.cookies.relay_id?.[0]?.value),
  })
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data

  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nAuthentication NFR summary written to ${summaryPath}\n`,
  }
}
