// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Render actual order pages to check courier-only controls; review pending.
// See ../../order-service/usage-log.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const AcceptedOrderPage = require('../pages/AcceptedOrderPage.tsx').default;
const OrderDetailsPage = require('../pages/OrderDetailsPage.tsx').default;
const base = { id:'order', requesterId:'requester', courierId:'courier', requesterName:'Requester',
  courierName:'Courier', status:'accepted', pickupStore:'Cafe', pickupLocation:'COM1',
  deliveryLocation:'COM2', description:'Tea', credits:4, deadline:'Tomorrow', createdAt:'Today' };
const render = (Page, user, status, extra={}) => renderToStaticMarkup(React.createElement(Page, {
  initialOrder:{...base,status,...extra}, currentUserId:user, onBack:()=>{}, onAccepted:()=>{}, onDelivered:()=>{},
}));
for (const Page of [AcceptedOrderPage, OrderDetailsPage]) {
  test(`${Page.name}: requester, outsider and unknown identity have no courier actions`,()=>{
    for(const user of ['requester','outsider',''])for(const status of ['accepted','picked-up']) {
      const html=render(Page,user,status);
      assert.doesNotMatch(html,/Mark as Picked Up|Mark as Delivered/);
    }
    assert.doesNotMatch(render(Page,'requester','accepted',{courierId:'requester'}),/Mark as Picked Up|Mark as Delivered/);
  });
  test(`${Page.name}: assigned courier sees only the action for the current status`,()=>{
    const assigned=render(Page,'courier','accepted');assert.match(assigned,/Mark as Picked Up/);assert.doesNotMatch(assigned,/Mark as Delivered/);
    const pickedUp=render(Page,'courier','picked-up');assert.match(pickedUp,/Mark as Delivered/);assert.doesNotMatch(pickedUp,/Mark as Picked Up/);
    for(const status of ['open','cancelled','expired','delivered'])assert.doesNotMatch(render(Page,'courier',status),/Mark as Picked Up|Mark as Delivered/);
  });
}
