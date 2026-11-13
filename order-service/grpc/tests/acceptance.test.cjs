// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated author-requested courier eligibility unit tests; review pending.
// See ../../usage-log.md.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {acceptanceFailure}=require('../dist/services/orderAcceptance');
const now=new Date('2026-10-22T00:00:00Z');
const order={requesterId:'requester',courierId:null,status:'UNASSIGNED',expiryTime:new Date(+now+60000),creditState:'RESERVED'};
const courier={id:'courier',roles:['USER']};
test('other USER or dual-role courier is eligible to accept an open reserved order',()=>{
 assert.equal(acceptanceFailure(order,courier,now),undefined);assert.equal(acceptanceFailure(order,{...courier,roles:['USER','ADMINISTRATOR']},now),undefined);
});
test('requesters and callers without USER role cannot accept',()=>{
 for(const actor of [{id:'requester',roles:['USER']},{id:'admin',roles:['ADMINISTRATOR']},{id:'courier',roles:[]}])assert.deepEqual(acceptanceFailure(order,actor,now),{status:403,error:'forbidden'});
});
test('assigned/terminal orders, pre-existing courier and non-reserved credit state are ineligible',()=>{
 for(const status of ['ASSIGNED','PICKED_UP','DELIVERED','CANCELLED'])assert.deepEqual(acceptanceFailure({...order,status},courier,now),{status:409,error:'invalid-transition'});
 assert.equal(acceptanceFailure({...order,courierId:'other'},courier,now).status,409);
 for(const creditState of ['REFUND_PENDING','REFUNDED','SETTLEMENT_PENDING','SETTLED'])assert.equal(acceptanceFailure({...order,creditState},courier,now).status,409);
});
test('expiry equality and past timestamps reject acceptance',()=>{
 assert.deepEqual(acceptanceFailure({...order,expiryTime:now},courier,now),{status:409,error:'expired'});
 assert.equal(acceptanceFailure({...order,expiryTime:new Date(+now-1)},courier,now).status,409);
});

// ChatGPT (Codex), 2026-11-06: Local invalid Supplier IDs must not masquerade as service outages; review pending.
test('Supplier ID adapter errors carry INVALID_ARGUMENT and classify as rejected',()=>{
 const {toSupplierRpcId}=require('../dist/dependencies/supplierErrorHelper');
 const {classifyCreditError}=require('../dist/dependencies/creditValidation');
 assert.equal(toSupplierRpcId('1'),1);
 assert.equal(toSupplierRpcId('9007199254740991'),Number.MAX_SAFE_INTEGER);
 for(const id of ['0','-1','abc','9007199254740992'])assert.throws(()=>toSupplierRpcId(id),error=>error.name==='InvalidSupplierError'&&error.code===3&&classifyCreditError(error)==='rejected');
});
