// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the errand browse smoke test.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import http from 'k6/http'
import { check, fail, sleep } from 'k6'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const email = __ENV.LOAD_TEST_USER_EMAIL
const password = __ENV.LOAD_TEST_USER_PASSWORD
const detailErrandId = __ENV.LOAD_TEST_ERRAND_ID
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/errand-browse-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)

export const options = {
  vus: Number(__ENV.SMOKE_VUS ?? 1),
  duration: __ENV.SMOKE_DURATION ?? '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{endpoint:errands-visible}': ['p(95)<2000'],
    'http_req_duration{endpoint:errands-mine}': ['p(95)<2000'],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

async function requiredCredential(value, name) {
  if (value) return value

  try {
    return await secrets.get(name)
  } catch {
    fail(`${name} must be set in the local environment or configured as a Grafana Cloud k6 secret.`)
  }
}

function sessionHeaders(session) {
  return {
    Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
  }
}

function listErrands(session, scope, endpoint) {
  const response = http.get(`${baseUrl}/api/errands?scope=${scope}`, {
    headers: sessionHeaders(session),
    tags: { endpoint },
  })

  check(response, {
    [`${scope} errands returns HTTP 200`]: (res) => res.status === 200,
    [`${scope} errands returns an errands array`]: (res) => {
      try {
        return Array.isArray(res.json('errands'))
      } catch {
        return false
      }
    },
  })

  return response
}

export async function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: await requiredCredential(email, 'loadtestuseremail'),
      password: await requiredCredential(password, 'loadtestuserpassword'),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth-login' },
    },
  )

  const loggedIn = check(response, {
    'login returns HTTP 200': (res) => res.status === 200,
    'login returns relay access and ID cookies': (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })

  if (!loggedIn) {
    fail(`Load-test login failed with HTTP ${response.status}. Check the seeded test user credentials.`)
  }

  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export default function (session) {
  listErrands(session, 'visible', 'errands-visible')
  listErrands(session, 'mine', 'errands-mine')

  if (detailErrandId) {
    const response = http.get(`${baseUrl}/api/errands/${encodeURIComponent(detailErrandId)}`, {
      headers: sessionHeaders(session),
      tags: { endpoint: 'errand-detail' },
    })
    check(response, {
      'configured errand detail returns HTTP 200': (res) => res.status === 200,
      'configured errand detail returns an errand': (res) => {
        try {
          return Boolean(res.json('errand.id'))
        } catch {
          return false
        }
      },
    })
  }

  sleep(1)
}

export function handleSummary(data) {
  // setup() returns authentication cookies for the VUs. Never persist them in
  // the CI artifact or expose them through a summary file.
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data

  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nErrand browse smoke summary written to ${summaryPath}\n`,
  }
}
