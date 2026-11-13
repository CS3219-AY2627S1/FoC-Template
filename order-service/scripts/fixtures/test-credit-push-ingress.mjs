import assert from 'node:assert/strict';
const base = 'http://ingress-test:8080';
const paths = [
  '/api/credits/internal/order-events/open-refund',
  '/api/credits/internal/order-events/completion',
];
const path = paths[0];
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(base + path, { method: 'POST', signal: AbortSignal.timeout(2000) });
    if (response.status === 401) { ready = true; break; }
  } catch { /* isolated fixture containers are starting */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(ready, 'Origin fixture and ingress must become ready');
let assertions = 1;
for (const eventPath of paths) {
  const response = await fetch(base + eventPath, {
    method: 'POST',
    headers: { Authorization: 'Bearer routing-test-not-a-token', 'Content-Type': 'application/json', 'X-Request-Id': 'wire-test-request' },
    body: JSON.stringify({ message: { data: 'synthetic-test' }, subscription: 'synthetic' }),
  });
  assert.equal(response.status, 204, `Preserve typed POST path ${eventPath}, bearer, content type, request ID and exact JSON body`);
  assert.equal(response.headers.get('x-fixture-request-id'), 'wire-test-request');
  assertions += 2;
}
for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
  assert.equal((await fetch(base + path, { method })).status, 405, `Reject ${method}`);
  assertions++;
}
for (const forbidden of ['/', '/health', '/api/credits/me', '/api/credits/docs', '/api/orders']) {
  assert.equal((await fetch(base + forbidden)).status, 404, `Do not expose ${forbidden}`);
  assertions++;
}
assert.equal((await fetch(base + path + '?token=synthetic', { method: 'POST' })).status, 400);
assertions++;
assert.equal((await fetch(base + path, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
assertions++;
assert.equal((await fetch(base + path, { method: 'POST' })).status, 401, 'Do not turn origin auth failure into success');
assertions++;
assert.equal((await fetch('http://ingress-test:8081/health')).status, 200, 'Separate internal health port works');
assertions++;
console.log(`PASS: ${assertions} real nginx routing assertions; synthetic origin only, no cloud/financial verification.`);
