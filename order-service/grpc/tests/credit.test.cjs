// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Verified direct shared Credit client adoption, metadata, retries and validation.
// Author review pending; see ../../usage-log.md.
const {test}=require('node:test');const assert=require('node:assert/strict');
const grpc=require('@grpc/grpc-js');
const {createCreditClient,CreditService}=require('@foc/grpc');
const {classifyCreditError,validateReservation,validateBalance}=require('../dist/dependencies/creditValidation');
const id='00000000-0000-4000-8000-000000000001';
async function listen(t,handlers){
 const server=new grpc.Server();server.addService(CreditService.service,handlers);
 const port=await new Promise((r,j)=>server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(e,p)=>e?j(e):r(p)));
 const client=createCreditClient('127.0.0.1:'+port,{timeoutMs:1000});
 t.after(()=>{client.close();server.forceShutdown()});return client;
}
function auth(){const metadata=new grpc.Metadata();metadata.set('x-credit-service-token','test-token');return {metadata}}
test('shared Credit client carries Order token and expectedVersion across all six RPCs',async t=>{
 const receipt={orderId:id,requesterId:'u',amount:4,status:'RESERVED',reservationId:'r',version:2};let seen=0;
 const handlers={};for(const name of ['GetBalance','GetReservation','ReserveCredits','UpdateReservation','ReleaseCredits','SettleCredits'])handlers[name]=(call,cb)=>{
  assert.deepEqual(call.metadata.get('x-credit-service-token'),['test-token']);seen++;
  if(name==='UpdateReservation')assert.equal(call.request.expectedVersion,2);
  cb(null,name==='GetBalance'?{userId:'u',availableCredits:6,reservedCredits:4,totalCredits:10}:receipt);
 };
 const client=await listen(t,handlers),options=auth();
 assert.equal(validateBalance(await client.getBalance({userId:'u'},options)).availableCredits,6);
 assert.equal(validateReservation(await client.getReservation({orderId:id},options)).version,2);
 await client.reserveCredits({orderId:id,requesterId:'u',amount:4},options);
 await client.updateReservation({orderId:id,amount:5,expectedVersion:2},options);
 await client.releaseCredits({orderId:id},options);await client.settleCredits({orderId:id,courierId:'c'},options);assert.equal(seen,6);
});
test('shared client retries transient faults with unchanged token/body and preserves permanent error trailers',async t=>{
 let transient=0,rejected=0;
 const client=await listen(t,{GetBalance:(call,cb)=>{
  assert.deepEqual(call.metadata.get('x-credit-service-token'),['test-token']);
  if(call.request.userId==='reject'){
   rejected++;const metadata=new grpc.Metadata();metadata.set('x-credit-error-reason','ACCOUNT_NOT_FOUND');
   cb({code:grpc.status.NOT_FOUND,details:'Missing account',metadata});return;
  }
  assert.equal(call.request.userId,'u');transient++;
  if(transient===1){cb({code:grpc.status.UNAVAILABLE,details:'Transient fault'});return;}
  cb(null,{userId:'u',availableCredits:10,reservedCredits:0,totalCredits:10});
 }});
 assert.equal((await client.getBalance({userId:'u'},auth())).availableCredits,10);assert.equal(transient,2);
 await assert.rejects(()=>client.getBalance({userId:'reject'},auth()),error=>error.code===grpc.status.NOT_FOUND&&error.metadata.get('x-credit-error-reason')[0]==='ACCOUNT_NOT_FOUND');assert.equal(rejected,1);
});
test('business rejection differs from uncertain or unavailable integration',()=>{
 assert.equal(classifyCreditError({code:grpc.status.FAILED_PRECONDITION}),'rejected');assert.equal(classifyCreditError({code:grpc.status.DEADLINE_EXCEEDED}),'uncertain');assert.equal(classifyCreditError({code:grpc.status.UNAVAILABLE}),'uncertain');assert.equal(classifyCreditError({code:grpc.status.UNIMPLEMENTED}),'unavailable');
});
test('shared client permits plaintext container targets and validates timeout settings',()=>{
 const client=createCreditClient('credit-service:50054',{timeoutMs:1000});client.close();
 assert.throws(()=>createCreditClient('credit-service:50054',{timeoutMs:0}),/timeoutMs/);
});
test('Order retains response validation without implementing its own transport',()=>{
 assert.throws(()=>validateReservation({orderId:id,requesterId:'u',amount:4,status:'RESERVATION_STATUS_UNSPECIFIED',reservationId:'r',version:1}));
 assert.throws(()=>validateBalance({userId:'u',availableCredits:-1,reservedCredits:1,totalCredits:0}));
});


test('missing Credit accounts are retryable while other NOT_FOUND reasons stay permanent',()=>{
 const metadata=new grpc.Metadata();metadata.set('x-credit-error-reason','ACCOUNT_NOT_FOUND');
 assert.equal(classifyCreditError({code:grpc.status.NOT_FOUND,metadata}),'unavailable');
 metadata.set('x-credit-error-reason','RESERVATION_NOT_FOUND');
 assert.equal(classifyCreditError({code:grpc.status.NOT_FOUND,metadata}),'rejected');
 assert.equal(classifyCreditError({code:grpc.status.NOT_FOUND}),'rejected');
});
