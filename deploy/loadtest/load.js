// Load for the autoscaling evidence (N6.3), run by deploy/scripts/loadtest.sh inside the cluster.
// Every virtual user asks for the own profile without pause, as every page of Relay does. Each
// request costs the user-service a session lookup, so that is the service that has to scale out.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL;
const VUS = Number(__ENV.VUS || 20);

export const options = {
  stages: [
    { duration: '30s', target: VUS },
    { duration: __ENV.HOLD || '5m', target: VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/user/auth/login`,
    JSON.stringify({ identifier: 'admin', password: __ENV.ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) throw new Error(`login failed with ${res.status}: ${res.body}`);
  // The session cookie is marked Secure and these requests are plain HTTP inside the cluster,
  // so k6 would not send it by itself.
  return { cookie: `relay_session=${res.cookies.relay_session[0].value}` };
}

export default function (data) {
  const res = http.get(`${BASE}/api/user/users/me`, { headers: { Cookie: data.cookie } });
  check(res, { 'profile answered 200': (r) => r.status === 200 });
}
