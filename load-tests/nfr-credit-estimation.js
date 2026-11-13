import http from 'k6/http'
import { check, fail } from 'k6'
import execution from 'k6/execution'
import { Counter, Rate } from 'k6/metrics'
import secrets from 'k6/secrets'

const baseUrl = (__ENV.BASE_URL ?? 'http://host.docker.internal:8080').replace(/\/$/, '')
const summaryPath = __ENV.K6_SUMMARY_PATH ?? 'load-tests/results/nfr-credit-estimation-summary.json'
const cloudProjectId = Number(__ENV.K6_CLOUD_PROJECT_ID ?? 0)
const ratePerMinute = Number(__ENV.NFR_ESTIMATION_RATE_PER_MIN ?? 15)
const duration = __ENV.NFR_ESTIMATION_DURATION ?? '3m'
const preAllocatedVUs = Number(__ENV.NFR_ESTIMATION_PREALLOCATED_VUS ?? 5)
const maxVUs = Number(__ENV.NFR_ESTIMATION_MAX_VUS ?? 20)
const p95Limit = Number(__ENV.NFR_ESTIMATION_P95_LIMIT_MS ?? 3500)

const estimationSuccess = new Rate('credit_estimation_success')
const rateLimitedResponses = new Counter('credit_estimation_rate_limited')
const invalidResponses = new Counter('credit_estimation_invalid_response')

const variants = [
  {
    serviceType: 0,
    baselineMinutes: 90,
    name: 'Collect mala hotpot',
    description: 'Collect mala hotpot with several protein, vegetable, and noodle items.',
    instructions: 'Keep the containers upright.',
  },
  {
    serviceType: 1,
    baselineMinutes: 60,
    name: 'Collect two iced coffees',
    description: 'Collect two prepared iced coffees and deliver them together.',
    instructions: 'Use the drink carrier provided by the supplier.',
  },
  {
    serviceType: 2,
    baselineMinutes: 180,
    name: 'Purchase stationery',
    description: 'Purchase two notebooks, pens, and a pack of index cards.',
    instructions: 'Keep the receipt with the items.',
  },
  {
    serviceType: 3,
    baselineMinutes: 120,
    name: 'Collect bound lecture notes',
    description: 'Collect one bound set of printed lecture notes and deliver it.',
    instructions: 'Keep the printed pages dry.',
  },
  {
    serviceType: 4,
    baselineMinutes: 240,
    name: 'Collect a medium parcel',
    description: 'Collect one medium parcel from the campus collection point.',
    instructions: 'Handle the parcel carefully.',
  },
]
const durationMultipliers = [0.5, 1, 2]

export const options = {
  scenarios: {
    credit_estimation_load: {
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
    credit_estimation_success: ['rate>0.99'],
    credit_estimation_rate_limited: ['count==0'],
    credit_estimation_invalid_response: ['count==0'],
    dropped_iterations: ['count==0'],
    'http_req_duration{endpoint:credit-estimation}': [`p(95)<${p95Limit}`],
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

async function login(email, password, label) {
  const response = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth-login' },
  })
  const loggedIn = check(response, {
    [`${label} estimation login returns HTTP 200`]: (res) => res.status === 200,
    [`${label} estimation login returns cookies`]: (res) =>
      Boolean(res.cookies.relay_access?.[0]?.value) && Boolean(res.cookies.relay_id?.[0]?.value),
  })
  if (!loggedIn) fail(`${label} estimation login failed with HTTP ${response.status}.`)
  return {
    accessToken: response.cookies.relay_access[0].value,
    idToken: response.cookies.relay_id[0].value,
  }
}

export async function setup() {
  const credentials = [
    {
      label: 'requester',
      email: await requiredCredential(__ENV.LOAD_TEST_REQUESTER_EMAIL, 'loadtestrequesteremail'),
      password: await requiredCredential(
        __ENV.LOAD_TEST_REQUESTER_PASSWORD,
        'loadtestrequesterpassword',
      ),
    },
    {
      label: 'courier A',
      email: await requiredCredential(__ENV.LOAD_TEST_COURIER_EMAIL, 'loadtestcourieremail'),
      password: await requiredCredential(
        __ENV.LOAD_TEST_COURIER_PASSWORD,
        'loadtestcourierpassword',
      ),
    },
    {
      label: 'courier B',
      email: await requiredCredential(__ENV.LOAD_TEST_COURIER_B_EMAIL, 'loadtestcourierbemail'),
      password: await requiredCredential(
        __ENV.LOAD_TEST_COURIER_B_PASSWORD,
        'loadtestcourierbpassword',
      ),
    },
  ]

  const sessions = []
  for (const credential of credentials) {
    sessions.push(await login(credential.email, credential.password, credential.label))
  }
  return sessions
}

function sessionHeaders(session) {
  return {
    'Content-Type': 'application/json',
    Cookie: `relay_access=${session.accessToken}; relay_id=${session.idToken}`,
  }
}

function parseEstimate(response) {
  try {
    return response.json()
  } catch {
    return undefined
  }
}

export default function (sessions) {
  const iteration = execution.scenario.iterationInTest
  const session = sessions[iteration % sessions.length]
  const variant = variants[iteration % variants.length]
  const durationMultiplier = durationMultipliers[iteration % durationMultipliers.length]
  const startAt = new Date(Date.now() + 5 * 60 * 1000)
  const expiresAt = new Date(
    startAt.getTime() + variant.baselineMinutes * durationMultiplier * 60 * 1000,
  )

  const response = http.post(
    `${baseUrl}/api/errands/estimate-credit`,
    JSON.stringify({
      name: variant.name,
      description: variant.description,
      serviceType: variant.serviceType,
      instructions: variant.instructions,
      startAt: startAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      availableCredit: 100,
    }),
    {
      headers: sessionHeaders(session),
      tags: {
        endpoint: 'credit-estimation',
        service_type: String(variant.serviceType),
        duration_category:
          durationMultiplier < 1 ? 'short' : durationMultiplier > 1 ? 'long' : 'standard',
      },
    },
  )

  const estimate = parseEstimate(response)
  const validEstimate =
    response.status === 200 &&
    Number.isInteger(estimate?.minCredits) &&
    Number.isInteger(estimate?.maxCredits) &&
    estimate.minCredits >= 10 &&
    estimate.maxCredits <= 50 &&
    estimate.minCredits <= estimate.maxCredits &&
    typeof estimate.reason === 'string' &&
    estimate.reason.length > 0 &&
    estimate.reason.length <= 160 &&
    !estimate.reason.includes('…')

  check(response, {
    'credit estimation returns HTTP 200': (res) => res.status === 200,
    'credit estimation returns a valid range and complete reason': () => validEstimate,
  })

  estimationSuccess.add(validEstimate)
  if (response.status === 429) rateLimitedResponses.add(1)
  if (response.status === 200 && !validEstimate) invalidResponses.add(1)
}

export function handleSummary(data) {
  const safeData = JSON.parse(JSON.stringify(data))
  delete safeData.setup_data
  return {
    [summaryPath]: JSON.stringify(safeData, null, 2),
    stdout: `\nCredit estimation NFR summary written to ${summaryPath}\n`,
  }
}
