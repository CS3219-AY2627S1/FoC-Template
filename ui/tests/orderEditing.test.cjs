// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { editOrder } = require('../api/orders.ts');
const { creditDescription, visibleCreditHistory } = require('../api/credits.ts');

test('editing sends PATCH and a stable retry key and distinguishes pending confirmation', async t => {
  const fetchBefore = global.fetch;
  const storageBefore = global.localStorage;
  t.after(() => { global.fetch = fetchBefore; global.localStorage = storageBefore; });
  global.localStorage = { getItem: () => 'token' };
  const patch = { requestDetails: 'Tea', credits: 3, expiryTime: '2027-01-01T00:00:00Z' };
  let status = 202;
  global.fetch = async (url, options) => {
    assert.equal(url, '/backend/orders/order-id');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers['Idempotency-Key'], 'retry-key');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.deepEqual(JSON.parse(options.body), patch);
    return { ok: true, status, json: async () => ({ order: {} }) };
  };
  assert.equal((await editOrder('order-id', patch, 'retry-key')).pending, true);
  status = 200;
  assert.equal((await editOrder('order-id', patch, 'retry-key')).pending, false);
});

test('credit history identifies related orders and keeps a fallback when order data is unavailable', () => {
  const orders = [{ id: 'order-id', description: 'Tea', pickupStore: 'Cafe' }];
  assert.equal(creditDescription({ type: 'TRANSFER_OUT', orderId: 'order-id' }, orders),
    'Paid a courier — Cafe — Tea');
  assert.equal(creditDescription({ type: 'TRANSFER_IN', orderId: 'order-id' }, orders),
    'Paid for a completed request — Cafe — Tea');
  assert.equal(creditDescription({ type: 'TRANSFER_OUT', orderId: 'order-id' }, []), 'Paid a courier');
  assert.equal(creditDescription({ type: 'INITIAL_GRANT', orderId: null }, []), 'Welcome credits');
});

test('credit history hides reservations and order credit edits', () => {
  const visible = visibleCreditHistory([
    { id: 'reserve', type: 'RESERVED', orderId: 'order-id' },
    { id: 'edit', type: 'RESERVATION_UPDATED', orderId: 'order-id' },
    { id: 'release', type: 'RELEASED', orderId: 'order-id' },
    { id: 'pay', type: 'TRANSFER_OUT', orderId: 'order-id' },
    { id: 'earn', type: 'TRANSFER_IN', orderId: 'order-id' },
    { id: 'grant', type: 'INITIAL_GRANT', orderId: null },
  ]);
  assert.deepEqual(visible.map(entry => entry.id), ['pay', 'earn', 'grant']);
});

test('request keys work on HTTP pages without randomUUID', t => {
  const { newRequestKey } = require('../api/orders.ts');
  const descriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', { configurable: true, value: {
    getRandomValues: values => { values.fill(11); return values; },
  }});
  t.after(() => {
    if (descriptor) Object.defineProperty(global, 'crypto', descriptor);
    else delete global.crypto;
  });
  assert.match(newRequestKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('edit order is shown only for the requester of an open order', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Details = require('../pages/OrderDetailsPage.tsx').default;
  const order = { id: 'id', requesterId: 'requester', requesterName: 'Requester',
    description: 'Tea', pickupStore: 'Cafe', pickupLocation: 'COM1',
    deliveryLocation: 'COM2', credits: 3, status: 'open', deadline: 'Tomorrow' };
  const render = (status, currentUserId) => renderToStaticMarkup(React.createElement(Details, {
    initialOrder: { ...order, status }, currentUserId,
    onBack() {}, onAccepted() {}, onDelivered() {},
  }));
  assert.match(render('open', 'requester'), /Edit order/);
  assert.doesNotMatch(render('open', 'courier'), /Edit order/);
  for (const status of ['accepted', 'picked-up', 'delivered', 'cancelled', 'expired']) {
    assert.doesNotMatch(render(status, 'requester'), /Edit order/);
  }
});

test('open errands query uses authenticated Order endpoint, preserves empty results, and surfaces errors', async t => {
  const { listOrders } = require('../api/orders.ts');
  const oldFetch = global.fetch, oldStorage = global.localStorage;
  t.after(() => { global.fetch = oldFetch; global.localStorage = oldStorage; });
  global.localStorage = { getItem: () => 'token' };
  const controller = new AbortController();
  const sample = { id: 'real-order', requesterId: 'other-user', requesterName: 'Student',
    pickupStore: 'Cafe', pickupLocation: 'COM1', destination: 'COM2', requestDetails: 'Tea',
    credits: 3, expiryTime: '2027-01-01T00:00:00Z', createdAt: '2026-11-12T00:00:00Z',
    status: 'UNASSIGNED', creditState: 'RESERVED' };
  let entries = [sample];
  global.fetch = async (url, options) => {
    assert.equal(url, '/backend/orders?scope=open');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.signal, controller.signal);
    return { ok: true, status: 200, json: async () => ({ orders: entries }) };
  };
  const results = await listOrders('open', controller.signal);
  assert.equal(results[0].id, sample.id);
  assert.equal(results[0].description, 'Tea');
  entries = [];
  assert.deepEqual(await listOrders('open', controller.signal), []);
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'dependency-unavailable' }) });
  await assert.rejects(listOrders('open'), /dependency-unavailable/);
  global.fetch = async () => { throw Error('offline'); };
  await assert.rejects(listOrders('open'), /Cannot reach the server/);
});
