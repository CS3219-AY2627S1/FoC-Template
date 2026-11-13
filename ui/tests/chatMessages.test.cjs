// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Message ordering, history races and receipt regression tests.
// Human review pending; see ui/ai-usage/chat-bug-fixes.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeChatMessages } = require('../api/chat.ts');
const message = (id, minute, readAt = null) => ({
  id, orderId: 'order', senderId: 'courier', body: id,
  sentAt: '2026-11-12T13:' + minute + ':00Z', readAt,
});
test('out-of-order events and acknowledgements render chronologically and deduplicate', () => {
  const newest = message('12', '24'), older = message('10', '22');
  assert.deepEqual(mergeChatMessages([newest], [older, newest]).map(m => m.id), ['10', '12']);
});
test('late history cannot drop live messages or undo seen receipts', () => {
  const seen = message('10', '22', '2026-11-12T13:25:00Z');
  const merged = mergeChatMessages([seen, message('12', '24')], [message('10', '22')]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].readAt, seen.readAt);
});
test('equal timestamps sort numeric IDs without precision loss', () => {
  const ids = ['9007199254740993', '10', '2', '9007199254740992'];
  assert.deepEqual(mergeChatMessages([], ids.map(id => message(id, '22'))).map(m => m.id),
    ['2', '10', '9007199254740992', '9007199254740993']);
});
test('completed courier orders keep an explicit details and chat entry', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Card = require('../components/RequestCard.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Card, {
    order: { id:'order', status:'delivered', courierId:'courier', requesterName:'Student',
      pickupStore:'Cafe', deliveryLocation:'COM1', description:'Tea', credits:2, deadline:'Today' },
    onClick() {},
  }));
  assert.match(html, /View Details &amp; Chat/);
});

test('existing backend chat window remains open until the exact one-hour boundary', () => {
  const { chatAccess } = require('../../chat-service/src/rules.ts');
  const end = Date.parse('2026-11-12T13:00:00Z');
  for (const status of ['DELIVERED', 'CANCELLED']) {
    const order = { courierId:'courier', deliveredAt:status==='DELIVERED' ? new Date(end).toISOString() : null,
      cancelledAt:status==='CANCELLED' ? new Date(end).toISOString() : null };
    assert.deepEqual(chatAccess(order,end+3599999), {canRead:true,canSend:true});
    assert.deepEqual(chatAccess(order,end+3600000), {canRead:false,canSend:false});
  }
});
