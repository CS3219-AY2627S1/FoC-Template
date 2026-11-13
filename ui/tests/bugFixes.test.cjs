// AI-assisted (Claude Opus 5.5), 2026-11-12: checks for the UI bug-fix pass; see ui/ai-usage/usage-log.md, entry 002
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const order = {
  id: 'id', requesterId: 'requester', requesterName: 'Requester', courierId: 'courier',
  courierName: 'Courier', description: 'Tea', pickupStore: 'Cafe', pickupLocation: '1.2966, 103.7764',
  deliveryLocation: 'COM2', credits: 3, deadline: 'Tomorrow', createdAt: 'Today',
};

test('pickup coordinates are never shown as the place name', () => {
  const { isCoordinates, mapsLink } = require('../hooks/usePickupPlace.ts');
  assert.equal(isCoordinates('1.2966, 103.7764'), true);
  assert.equal(isCoordinates('COM1, Level 1'), false);
  assert.equal(mapsLink('1.2966, 103.7764'), 'https://www.google.com/maps/search/?api=1&query=1.2966,103.7764');
  assert.equal(mapsLink('COM1, Level 1'), null);

  const Details = require('../pages/OrderDetailsPage.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Details, {
    initialOrder: { ...order, status: 'accepted' }, currentUserId: 'courier',
    onBack() {}, onAccepted() {}, onDelivered() {},
  }));
  assert.doesNotMatch(html, /head to 1\.2966/);
  assert.match(html, /Open in Maps/);
});

test('details progress row follows the order status', () => {
  const Details = require('../pages/OrderDetailsPage.tsx').default;
  const render = status => renderToStaticMarkup(React.createElement(Details, {
    initialOrder: { ...order, status }, currentUserId: 'someone',
    onBack() {}, onAccepted() {}, onDelivered() {},
  }));
  assert.match(render('picked-up'), /✓ Pickup/);
  assert.doesNotMatch(render('accepted'), /✓/);
  assert.match(render('delivered'), /✓ Complete/);
  assert.match(render('cancelled'), /This errand was cancelled/);
});

test('active errand tracker ticks every step once delivered', () => {
  const Accepted = require('../pages/AcceptedOrderPage.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Accepted, {
    initialOrder: { ...order, status: 'delivered' }, currentUserId: 'courier',
    onBack() {}, onDelivered() {},
  }));
  // three tick icons, no step number left on the last circle
  assert.equal(html.match(/M5 13l4 4L19 7/g).length, 3);
});

test('password fields start hidden with a show button', () => {
  const PasswordInput = require('../components/PasswordInput.tsx').default;
  const html = renderToStaticMarkup(React.createElement(PasswordInput, { value: 'x', onChange() {} }));
  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="Show password"/);
});
