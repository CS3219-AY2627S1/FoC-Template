/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-04
 * Scope: Implemented the team-specified mixed pagination load test with k6.
 * Source: https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

const { BASE_URL, USER_TOKEN, ADMIN_TOKEN, CATEGORY_ID, LOCATION_ID } = __ENV;
if (!BASE_URL || !USER_TOKEN || !ADMIN_TOKEN || !/^[1-9]\d*$/.test(CATEGORY_ID || '') || !/^[1-9]\d*$/.test(LOCATION_ID || '')) {
  throw new Error('BASE_URL, USER_TOKEN, ADMIN_TOKEN and positive CATEGORY_ID and LOCATION_ID are required');
}

export const options = {
  discardResponseBodies: true,
  scenarios: {
    typical: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: '1m', preAllocatedVUs: 200 },
    peak: { executor: 'constant-arrival-rate', rate: 200, timeUnit: '1s', duration: '1m', startTime: '1m30s', preAllocatedVUs: 400 },
  },
  thresholds: {
    'http_req_duration{scenario:typical,expected_response:true}': ['p(50)<=300', 'p(95)<=500'],
    'http_req_duration{scenario:peak,expected_response:true}': ['p(50)<=400', 'p(95)<=600'],
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const admin = Math.random() < 0.05;
  const group = Math.random();
  const params = { page: '1', limit: '50' };
  if (group >= 0.7 && group < 0.9) {
    params.page = String(2 + Math.floor(Math.random() * 4));
  } else if (group >= 0.9) {
    const complex = Math.random();
    if (complex < 0.4) params.page = String(6 + Math.floor(Math.random() * 75));
    else if (complex < 0.55) params.search = 'errand';
    else if (complex < 0.7) params.isOpen = 'true';
    else if (complex < 0.85) params.category_id = CATEGORY_ID;
    else params.location_id = LOCATION_ID;
  }
  const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const path = admin ? '/api/v1/admin/suppliers' : '/api/v1/suppliers';
  const response = http.get(`${BASE_URL}${path}?${query}`, {
    headers: { Authorization: `Bearer ${admin ? ADMIN_TOKEN : USER_TOKEN}` },
    tags: { name: path },
  });
  check(response, { 'response is 200': (res) => res.status === 200 });
}
