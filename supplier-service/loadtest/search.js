// Load test for N2.1.1 and N2.2.1: search and filter reads from 1000
// concurrent clients must stay within 100 ms.
//
// Each virtual client searches, looks at the answer for about a second, and
// searches again. The clients join over 15 seconds, as real users would, and
// only the requests made once all of them are in are judged.
//
// The sessions are real. Before the test starts it logs in to the user-service
// 50 times as the administrator, which gives 50 different sessions that the
// clients share, and it logs them out at the end. The supplier-service therefore
// asks the real user-service, as it would for 50 different people.
//
// Run it from the repository root, with the system up (docker compose up -d):
//   docker run --rm -i --network relay_edge \
//     -v "$PWD/supplier-service/loadtest:/scripts:ro" \
//     -e BASE=http://supplier-service:3002 -e USER_URL=http://user-service:3000 \
//     grafana/k6 run --summary-trend-stats "avg,med,p(95),p(99),p(99.9),max" /scripts/search.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE || 'http://localhost:3002'
const USER_URL = __ENV.USER_URL || 'http://localhost:3001'
const ADMIN = __ENV.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'change-me'
const SESSIONS = Number(__ENV.SESSIONS || 50)
const CLIENTS = Number(__ENV.CLIENTS || 1000)
const RAMP_SECONDS = 15
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 30)
// Share of searches that are a keyword nobody asked for a moment ago, so that
// they cannot be served from the service's short-lived memory.
const UNIQUE_SHARE = Number(__ENV.UNIQUE_SHARE || 0.2)

const COMMON = [
  '',
  'q=coffee',
  'q=printer',
  'q=prince+george',
  'q=cafe&type=Food/Coffee',
  'type=Printing',
  'type=Food&zone=Central',
  'type=Shopping',
  'zone=Computing',
  'building=COM2',
  'page=2',
]
const UNIQUE = Array.from({ length: 300 }, (_, i) => 'q=' + (i * 7919).toString(36).slice(0, 3))

export const options = {
  setupTimeout: '180s',
  scenarios: {
    clients: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_SECONDS}s`, target: CLIENTS },
        { duration: `${HOLD_SECONDS}s`, target: CLIENTS },
      ],
    },
  },
  thresholds: {
    'http_req_duration{phase:steady}': ['p(99)<100'],
    'http_req_failed{phase:steady}': ['rate<0.001'],
  },
}

export function setup() {
  const tokens = []
  for (let i = 0; i < SESSIONS; i++) {
    const login = http.post(
      `${USER_URL}/auth/login`,
      JSON.stringify({ identifier: ADMIN, password: ADMIN_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    const cookie = login.cookies['relay_session']
    if (login.status !== 200 || !cookie) {
      throw new Error(`Could not log in as ${ADMIN} at ${USER_URL}: HTTP ${login.status}. Set ADMIN_USERNAME and ADMIN_PASSWORD.`)
    }
    tokens.push(cookie[0].value)
  }
  return { start: Date.now(), tokens }
}

export default function (data) {
  const pool = Math.random() < UNIQUE_SHARE ? UNIQUE : COMMON
  const query = pool[Math.floor(Math.random() * pool.length)]
  const phase = Date.now() - data.start > RAMP_SECONDS * 1000 ? 'steady' : 'ramp'
  const token = data.tokens[__VU % data.tokens.length]

  const response = http.get(`${BASE}/suppliers${query ? '?' + query : ''}`, {
    headers: { Cookie: `relay_session=${token}` },
    tags: { phase },
  })
  check(response, { 'status is 200': (r) => r.status === 200 })
  sleep(0.5 + Math.random())
}

export function teardown(data) {
  for (const token of data.tokens) {
    http.post(`${USER_URL}/auth/logout`, null, { headers: { Cookie: `relay_session=${token}` } })
  }
}
