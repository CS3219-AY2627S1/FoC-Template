// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the errand read NFR load test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail, sleep } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const detailErrandId = __ENV.LOAD_TEST_ERRAND_ID
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-errand-read-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)

const startVUs = Number(__ENV.NFR_START_VUS ?? 10)
const targetVUs = Number(__ENV.NFR_TARGET_VUS ?? 100)
const rampDuration = __ENV.NFR_RAMP_DURATION ?? '1m'
const holdDuration = __ENV.NFR_HOLD_DURATION ?? '5m'
const rampDownDuration = __ENV.NFR_RAMP_DOWN_DURATION ?? '1m'
const thinkTime = Number(__ENV.NFR_THINK_TIME ?? 1)
const p95Limit = Number(__ENV.NFR_P95_LIMIT_MS ?? 250)

export const options = {
  scenarios: {
    errand_read_load: {
      executor: 'ramping-vus',
      startVUs,
      stages: [
        { duration: rampDuration, target: targetVUs },
        { duration: holdDuration, target: targetVUs },
        { duration: rampDownDuration, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    [`http_req_duration{endpoint:errands-visible}`]: [`p(95)<${p95Limit}`],
    [`http_req_duration{endpoint:errand-detail}`]: [`p(95)<${p95Limit}`],
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
  return {
    Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
  }
}

function parseErrands(response) {
  try {
    const body = response.json()
    return Array.isArray(body?.errands) ? body.errands : []
  } catch {
    return []
  }
}

export async function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: await requiredCredential(__ENV.LOAD_TEST_USER_EMAIL, 'loadtestuseremail'),
      password: await requiredCredential(__ENV.LOAD_TEST_USER_PASSWORD, 'loadtestuserpassword'),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth-login' },
    },
  )

  const loggedIn = check(response, {
    'NFR login returns HTTP 200': (res) => res.status === 200,
    'NFR login returns relay cookies': (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })

  if (!loggedIn) {
    fail(`NFR load-test login failed with HTTP ${response.status}. Check the provisioned test credentials.`)
  }

  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export default function (session) {
  const headers = sessionHeaders(session)
  const listResponse = http.get(`${baseUrl}/api/errands?scope=visible`, {
    headers,
    tags: { endpoint: 'errands-visible' },
  })
  const errands = parseErrands(listResponse)

  check(listResponse, {
    'visible errands return HTTP 200': (res) => res.status === 200,
    'visible errands return an array': () => Array.isArray(errands),
  })

  const errandId = detailErrandId ?? errands[0]?.id
  if (errandId) {
    const detailResponse = http.get(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}`, {
      headers,
      tags: { endpoint: 'errand-detail' },
    })

    check(detailResponse, {
      'errand detail returns HTTP 200': (res) => res.status === 200,
      'errand detail returns an errand': (res) => {
        try {
          return Boolean(res.json('errand.id'))
        } catch {
          return false
        }
      },
    })
  }

  sleep(thinkTime)
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data

  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nErrand read NFR summary written to ${summaryPath}\n`,
  }
}
