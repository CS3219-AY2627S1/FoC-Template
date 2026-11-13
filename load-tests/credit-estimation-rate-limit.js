import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const summaryPath =
  __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/credit-estimation-rate-limit-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const perUserLimit = Number(__ENV.NFR_ESTIMATION_PER_USER_LIMIT ?? 20)
const totalRequests = Number(__ENV.NFR_ESTIMATION_RATE_LIMIT_REQUESTS ?? 25)
const vus = Number(__ENV.NFR_ESTIMATION_RATE_LIMIT_VUS ?? 5)
const maxDuration = __ENV.NFR_ESTIMATION_RATE_LIMIT_MAX_DURATION ?? '1m'
const rejectionP95Limit = Number(__ENV.NFR_ESTIMATION_RATE_LIMIT_REJECTION_P95_MS ?? 500)
const expectedAllowed = Math.min(perUserLimit, totalRequests)
const expectedLimited = Math.max(0, totalRequests - perUserLimit)

const allowedResponses = new Counter('credit_estimation_rate_limit_allowed')
const limitedResponses = new Counter('credit_estimation_rate_limit_rejected')
const unexpectedResponses = new Counter('credit_estimation_rate_limit_unexpected')
const rejectionDuration = new Trend('credit_estimation_rate_limit_rejection_duration', true)

http.setResponseCallback(http.expectedStatuses(200, 429))

export const options = {
  scenarios: {
    credit_estimation_rate_limit: {
      executor: 'shared-iterations',
      vus,
      iterations: totalRequests,
      maxDuration,
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate>0.99'],
    credit_estimation_rate_limit_allowed: [`count==${expectedAllowed}`],
    credit_estimation_rate_limit_rejected: [`count==${expectedLimited}`],
    credit_estimation_rate_limit_unexpected: ['count==0'],
    credit_estimation_rate_limit_rejection_duration: [`p(95)<${rejectionP95Limit}`],
  },
  ...(cloudProjectId > 0 ? { cloud: { projectID: cloudProjectId } } : {}),
}

async function requiredCredential(value, secretName) {
  if (value) return value
  try {
    return await secrets.get(secretName)
  } catch {
    fail(
      `${secretName} must be set in the local environment or configured as a Grafana Cloud k6 secret.`,
    )
  }
}

export async function setup() {
  if (totalRequests <= perUserLimit) {
    fail('NFR_ESTIMATION_RATE_LIMIT_REQUESTS must exceed NFR_ESTIMATION_PER_USER_LIMIT.')
  }

  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: await requiredCredential(__ENV.LOAD_TEST_REQUESTER_EMAIL, 'loadtestrequesteremail'),
      password: await requiredCredential(
        __ENV.LOAD_TEST_REQUESTER_PASSWORD,
        'loadtestrequesterpassword',
      ),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth-login' },
    },
  )
  const loggedIn = check(response, {
    'rate-limit login returns HTTP 200': (res) => res.status === 200,
    'rate-limit login returns cookies': (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })
  if (!loggedIn) fail(`Rate-limit login failed with HTTP ${response.status}.`)
  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export default function (session) {
  const startAt = new Date(Date.now() + 5 * 60 * 1000)
  const expiresAt = new Date(startAt.getTime() + 90 * 60 * 1000)
  const response = http.post(
    `${baseUrl}/api/errands/estimate-credit`,
    JSON.stringify({
      name: 'Collect one prepared lunch',
      description: 'Collect one prepared lunch and deliver it to the requester.',
      serviceType: 0,
      instructions: 'Keep the meal upright.',
      startAt: startAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      availableCredit: 100,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
      },
      tags: { endpoint: 'credit-estimation-rate-limit' },
    },
  )

  const expectedStatus = response.status === 200 || response.status === 429
  check(response, {
    'rate-limit response is HTTP 200 or 429': () => expectedStatus,
    'rate-limit rejection identifies the limit': (res) => {
      if (res.status !== 429) return true
      try {
        const code = res.json('code')
        return code === 'CREDIT_ESTIMATION_RATE_LIMITED' || code === 'RATE_LIMITED'
      } catch {
        return false
      }
    },
  })

  if (response.status === 200) allowedResponses.add(1)
  else if (response.status === 429) {
    limitedResponses.add(1)
    rejectionDuration.add(response.timings.duration)
  } else unexpectedResponses.add(1)
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nCredit estimation rate-limit summary written to ${summaryPath}\n`,
  }
}
