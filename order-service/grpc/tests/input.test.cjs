// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated tests for author-approved validation rules; review pending.
// See ../../usage-log.md.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOrderSchema,editOrderSchema,isAllowedExpiry,idempotencyKeySchema}=require('../dist/api/dto/orderInput');
const body={supplierId:'1',destination:'PGP',requestDetails:'Coffee',credits:4,expiryTime:'2099-01-01T12:00:00+08:00'};
test('valid create converts offset-bearing date and preserves exact text',()=>{
 const value=createOrderSchema.parse(body);assert.equal(value.expiryTime.toISOString(),'2099-01-01T04:00:00.000Z');assert.equal(value.requestDetails,'Coffee');
});
test('reject invalid, incomplete, blank and identity-injecting bodies',()=>{
 for(const patch of [{supplierId:'0'},{supplierId:'9223372036854775808'},{destination:'  '},{requestDetails:'\n'},{credits:0},{credits:1.5},{credits:2147483648},{expiryTime:'2099-01-01T12:00:00'},{requesterId:'forged'}])assert.equal(createOrderSchema.safeParse({...body,...patch}).success,false,JSON.stringify(patch));
 assert.equal(createOrderSchema.safeParse({}).success,false);
});
test('edit validates supplied fields and requires at least one',()=>{
 assert.equal(editOrderSchema.safeParse({}).success,false);assert.equal(editOrderSchema.safeParse({credits:0}).success,false);assert.equal(editOrderSchema.safeParse({destination:'New place'}).success,true);
});
test('expiry has inclusive one-hour minimum using supplied database time',()=>{
 const now=new Date('2026-10-22T00:00:00Z');assert.equal(isAllowedExpiry(new Date(+now+3600000),now),true);assert.equal(isAllowedExpiry(new Date(+now+3599999),now),false);assert.equal(isAllowedExpiry(new Date('invalid'),now),false);
});
test('idempotency keys reject missing, blank and control characters',()=>{
 for(const key of [undefined,'','  ','key\n'])assert.equal(idempotencyKeySchema.safeParse(key).success,false);
 assert.equal(idempotencyKeySchema.safeParse('client-order-key').success,true);
});
