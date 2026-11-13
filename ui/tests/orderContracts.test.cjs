// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-06.
// Scope: Verify actual API mapping and financial/deadline UI feedback; review pending; see ../../order-service/usage-log.md.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {getOrder,updateOrder,deliveryFeedback,isValidOrderDeadline}=require('../api/orders.ts');
const sample={id:'order-id',supplierId:'1',pickupLocation:'1.3, 103.77',pickupStore:'Cafe',destination:'COM1',requestDetails:'Coffee',credits:4,expiryTime:'2027-01-01T00:00:00Z',status:'DELIVERED',requesterId:'requester',requesterName:'Requester',courierId:'courier',courierName:'Campus Courier',createdAt:'2026-11-06T00:00:00Z'};
test('API mapping preserves courier snapshot and pending credit state without claiming payment',async t=>{
 const oldFetch=global.fetch,oldStorage=global.localStorage;t.after(()=>{global.fetch=oldFetch;global.localStorage=oldStorage});
 global.localStorage={getItem:()=> 'token'};
 let state='SETTLEMENT_PENDING';const requests=[];
 global.fetch=async(url,options)=>{requests.push({url,options});return {status:state==='SETTLED'?200:202,ok:true,json:async()=>({order:{...sample,creditState:state}})}};
 const pending=await updateOrder(sample.id,'deliver');assert.equal(pending.courierName,'Campus Courier');assert.equal(pending.creditState,'SETTLEMENT_PENDING');assert.equal(deliveryFeedback(pending).accent,'Credit transfer pending');assert.doesNotMatch(deliveryFeedback(pending).subtitle,/have been added/);
 state='SETTLED';const settled=await getOrder(sample.id);assert.equal(settled.creditState,'SETTLED');assert.equal(deliveryFeedback(settled).accent,'+4 Credits');assert.match(deliveryFeedback(settled).subtitle,/have been added/);
 assert.equal(requests[0].url,'/backend/orders/order-id/deliver');assert.equal(requests[1].url,'/backend/orders/order-id');assert.equal(requests[1].options.headers.Authorization,'Bearer token');
});
test('missing financial confirmation never displays credits received',()=>{
 for(const state of [undefined,'RESERVED','REFUND_PENDING','REFUNDED','SETTLEMENT_PENDING'])assert.equal(deliveryFeedback({credits:4,creditState:state}).accent,'Credit transfer pending');
 assert.equal(deliveryFeedback(null).accent,'Credit transfer pending');
});
test('create deadline enforces one-hour boundary and rejects missing or past values',()=>{
 const now=Date.now();for(const offset of [-1,0,3599999])assert.equal(isValidOrderDeadline(now+offset,now),false);
 assert.equal(isValidOrderDeadline(now+3600000,now),true);assert.equal(isValidOrderDeadline(now+7200000,now),true);assert.equal(isValidOrderDeadline(NaN,now),false);
});
