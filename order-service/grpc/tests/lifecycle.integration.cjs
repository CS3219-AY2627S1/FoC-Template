// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated real PostgreSQL/HTTP lifecycle tests; review pending; see ../../usage-log.md.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {randomUUID,generateKeyPairSync}=require('node:crypto');const {once}=require('node:events');const jwt=require('jsonwebtoken');
const url=process.env.TEST_DATABASE_URL;
if(!url || !/^order_service_test(?:_[a-zA-Z0-9_]+)?$/.test(new URL(url).pathname.slice(1)))throw new Error('TEST_DATABASE_URL must name a dedicated order_service_test database');
process.env.DATABASE_URL=url;
const {PrismaClient}=require('../dist/generated/prisma');const db=new PrismaClient({datasourceUrl:url});
const {createOrderCreation}=require('../dist/services/orderCreation');const {createOrderEdits}=require('../dist/services/orderEdits');
const {createOrderLifecycle}=require('../dist/services/orderLifecycle');const {createOrderSchema,editOrderSchema}=require('../dist/api/dto/orderInput');
const {createApp}=require('../dist/api/app');
const {createOrderAcceptance}=require('../dist/services/orderAcceptance');
const prefix='lifecycle-'+randomUUID();let userCounter=0;
before(()=>db.$connect());
after(async()=>{
 const ids=(await db.orderCreation.findMany({where:{requesterId:{startsWith:prefix}},select:{orderId:true}})).map(r=>r.orderId);
 await db.orderEditOperation.deleteMany({where:{orderId:{in:ids}}});await db.creditOperation.deleteMany({where:{orderId:{in:ids}}});await db.order.deleteMany({where:{id:{in:ids}}});await db.orderCreation.deleteMany({where:{orderId:{in:ids}}});await db.$disconnect();
 await require('../dist/db').prisma.$disconnect();
});
function fixture() {
 const user=prefix+'-'+(++userCounter);const ledger=new Map();let calls=0;let updates=0;let releases=0;let settlements=0;let settleMode;let reserveMode;let updateMode;let releaseMode;let unavailable=false;let closed=false;let invalidSupplier=false;
 const err=(code)=>Object.assign(new Error('test RPC failure'),{code});
 const credit={
  getBalance:async({userId})=>({userId,totalCredits:20,reservedCredits:0,availableCredits:20}),
  getReservation:async({orderId})=>{if(unavailable)throw err(14);const r=ledger.get(orderId);if(!r)throw err(5);return {...r}},
  reserveCredits:async({orderId,requesterId,amount})=>{
   calls++;if(reserveMode==='reject')throw err(9);
   if(reserveMode==='before'){reserveMode=undefined;throw err(4)}
   if(!ledger.has(orderId))ledger.set(orderId,{orderId,requesterId,amount,status:'RESERVED',reservationId:randomUUID(),version:1});
   if(reserveMode==='after'){reserveMode=undefined;throw err(4)}return {...ledger.get(orderId)};
  },
  updateReservation:async({orderId,amount,expectedVersion})=>{
   updates++;const r=ledger.get(orderId);if(updateMode==='reject')throw err(9);
   if(updateMode==='before'){updateMode=undefined;throw err(14)}
   const reserved=[...ledger.values()].filter(x=>x.requesterId===r.requesterId&&x.status==='RESERVED').reduce((sum,x)=>sum+x.amount,0);
   if(amount-r.amount>20-reserved)throw err(9);
   if(r.status!=='RESERVED')throw err(9);if(r.version!==expectedVersion){if(r.version===expectedVersion+1&&r.amount===amount)return {...r};throw err(9)}
   r.amount=amount;r.version++;if(updateMode==='after'){updateMode=undefined;throw err(4)}return {...r};
  },
  releaseCredits:async({orderId})=>{releases++;if(releaseMode==='before'){releaseMode=undefined;throw err(14)}if(releaseMode==='reject')throw err(9);const r=ledger.get(orderId);if(releaseMode==='stale')return {...r,status:'RELEASED'};if(!r)throw err(5);if(r.status==='SETTLED')throw err(9);if(r.status!=='RELEASED'){r.status='RELEASED';r.version++}if(releaseMode==='after'){releaseMode=undefined;throw err(4)}return {...r}},
  settleCredits:async({orderId,courierId})=>{settlements++;if(settleMode==='reject')throw err(9);if(settleMode==='before'){settleMode=undefined;throw err(14)}const r=ledger.get(orderId);if(!r)throw err(5);if(settleMode==='stale')return {...r,status:'SETTLED',courierId};if(r.status==='RELEASED')throw err(9);if(r.status==='SETTLED'&&r.courierId!==courierId)throw err(9);if(r.status!=='SETTLED'){r.status='SETTLED';r.courierId=courierId;r.version++}if(settleMode==='after'){settleMode=undefined;throw err(4)}return {...r}},close:()=>{},
 };
 const directories={getRequester:async(userId)=>({userId,username:'student',firstName:'Campus',lastName:'Friend'}),
  getSupplier:async(supplierId)=>{if(invalidSupplier)throw err(5);return {supplierId,name:'Cafe',locationDescription:'Level 1',buildingName:'NUS',floor:1}},
  isSupplierOpen:async()=>({isOpen:!closed}),close:()=>{}};
 const creation=createOrderCreation(db,credit,directories),edits=createOrderEdits(db,credit,directories),lifecycle=createOrderLifecycle(db,credit);
 const input=()=>createOrderSchema.parse({supplierId:'1',destination:'PGP',requestDetails:'Coffee',credits:4,expiryTime:new Date(Date.now()+7200000).toISOString()});
 return {user,credit,directories,creation,edits,lifecycle,input,ledger,get calls(){return calls},get updates(){return updates},get releases(){return releases},get settlements(){return settlements},set settleMode(v){settleMode=v},set reserveMode(v){reserveMode=v},set updateMode(v){updateMode=v},set releaseMode(v){releaseMode=v},set unavailable(v){unavailable=v},set closed(v){closed=v},set invalidSupplier(v){invalidSupplier=v}};
}
async function due(orderId,type='RESERVE') {await db.creditOperation.updateMany({where:{orderId,type,state:{not:'SUCCEEDED'}},data:{state:'PENDING',nextRetryAt:new Date(0),leaseExpiresAt:null}})}
async function editDue(orderId) {await db.orderEditOperation.updateMany({where:{orderId,state:{in:['PENDING','PROCESSING']}},data:{state:'PENDING',nextRetryAt:new Date(0),leaseExpiresAt:null}})}
async function create(f,key='create') {const r=await f.creation.submit(f.user,key,f.input());assert.equal(r.status,201,String(r.error));return r.order}

test('create persists UNASSIGNED with matching reservation; same-key replay and conflict',async()=>{
 const f=fixture(),input=f.input();const first=await f.creation.submit(f.user,'one',input);assert.equal(first.status,201);assert.equal(first.order.status,'UNASSIGNED');assert.equal(first.order.creditState,'RESERVED');assert.equal(first.order.requesterName,'Campus Friend');
 const replay=await f.creation.submit(f.user,'one',input);assert.equal(replay.status,200);assert.equal(replay.order.id,first.order.id);assert.equal(f.calls,1);
 assert.equal((await f.creation.submit(f.user,'one',{...input,destination:'Other'})).status,409);
 const separate=await f.creation.submit(f.user,'two',input);assert.equal(separate.status,201);assert.notEqual(separate.order.id,first.order.id);
});
test('concurrent identical same-key creation publishes only one order/reservation',async()=>{
 const f=fixture(),input=f.input();const results=await Promise.all(Array.from({length:5},()=>f.creation.submit(f.user,'race',input)));
 assert.equal(await db.order.count({where:{requesterId:f.user}}),1);assert.equal(f.calls,1);assert.ok(results.every(r=>[200,201,202].includes(r.status)));
});
test('invalid/closed supplier, short expiry, insufficient balance and explicit rejection do not publish',async()=>{
 const f=fixture();f.closed=true;assert.equal((await f.creation.submit(f.user,'closed',f.input())).status,409);f.closed=false;f.invalidSupplier=true;assert.equal((await f.creation.submit(f.user,'missing',f.input())).status,409);f.invalidSupplier=false;
 assert.equal((await f.creation.submit(f.user,'expiry',{...f.input(),expiryTime:new Date(Date.now()+1000)})).status,400);
 assert.equal((await f.creation.submit(f.user,'insufficient',{...f.input(),credits:21})).status,409);
 f.reserveMode='reject';assert.equal((await f.creation.submit(f.user,'reject',f.input())).status,409);await f.creation.recoverBatch();assert.equal(f.calls,1);assert.equal(await db.order.count({where:{requesterId:f.user}}),0);
});
for(const mode of ['before','after'])test('reservation timeout '+mode+' commit resumes after service restart',async()=>{
 const f=fixture();f.reserveMode=mode;const input=f.input();const r=await f.creation.submit(f.user,'pending',input);assert.equal(r.status,202);assert.equal(await db.order.count({where:{id:r.creationId}}),0);
 await due(r.creationId);const restarted=createOrderCreation(db,f.credit,f.directories);await restarted.recoverBatch();const replay=await restarted.submit(f.user,'pending',input);assert.equal(replay.status,200);assert.equal(f.ledger.size,1);assert.equal(f.calls,mode==='after'?1:2);
});
test('database publication failure after reservation remains recoverable',async()=>{
 const f=fixture();let fail=true;
 const broken=new Proxy(db,{get(target,key){if(key==='$transaction')return(fn,...rest)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='order')return new Proxy(t.order,{get(o,m){if(m==='create')return async(...args)=>{if(fail){fail=false;throw new Error('injected persistence failure')}return o.create(...args)};return o[m]}});return t[k]}})),...rest);const value=target[key];return typeof value==='function'?value.bind(target):value}});
 const creation=createOrderCreation(broken,f.credit,f.directories);const r=await creation.submit(f.user,'db-failure',f.input());assert.equal(r.status,202);assert.equal(f.ledger.get(r.creationId).status,'RESERVED');assert.equal(await db.order.count({where:{id:r.creationId}}),0);
 await due(r.creationId);await f.creation.recoverBatch();assert.equal(await db.order.count({where:{id:r.creationId}}),1);assert.equal(f.calls,1);
});
test('pending reserved creation that expires is compensated without publishing',async()=>{
 const f=fixture();f.reserveMode='after';const r=await f.creation.submit(f.user,'expire-pending',f.input());const row=await db.orderCreation.findUniqueOrThrow({where:{orderId:r.creationId}});
 await db.orderCreation.update({where:{orderId:r.creationId},data:{payload:{...row.payload,expiryTime:new Date(Date.now()-1000).toISOString()}}});await f.creation.recoverBatch();
 assert.equal((await db.orderCreation.findUniqueOrThrow({where:{orderId:r.creationId}})).state,'FAILED');assert.equal(f.ledger.get(r.creationId).status,'RELEASED');assert.equal(await db.order.count({where:{id:r.creationId}}),0);
});
test('cancel retains history, protects ownership, releases once and supports replay',async()=>{
 const f=fixture(),order=await create(f);assert.equal((await f.lifecycle.cancel(order.id,'other')).status,403);
 const result=await f.lifecycle.cancel(order.id,f.user);assert.equal(result.order.status,'CANCELLED');assert.equal(result.order.cancellationReason,'REQUESTER');assert.equal(result.order.creditState,'REFUNDED');assert.equal(f.releases,1);
 await f.lifecycle.cancel(order.id,f.user);assert.equal(f.releases,1);assert.equal(await db.order.count({where:{id:order.id}}),1);
});
test('uncertain refund stays pending until current release is confirmed',async()=>{
 const f=fixture(),order=await create(f);f.releaseMode='after';const r=await f.lifecycle.cancel(order.id,f.user);assert.equal(r.order.creditState,'REFUND_PENDING');await due(order.id,'REFUND');await f.lifecycle.refundBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUNDED');assert.equal(f.releases,1);
});
test('expiry cancels all three active states including PICKED_UP and returns credits',async()=>{
 const f=fixture();for(const state of ['UNASSIGNED','ASSIGNED','PICKED_UP']){const order=await create(f,state);await db.order.update({where:{id:order.id},data:{status:state,expiryTime:new Date(Date.now()-1000),...(state!=='UNASSIGNED'?{courierId:'courier',acceptedAt:new Date()}:{}),...(state==='PICKED_UP'?{pickedUpAt:new Date()}: {})}});}
 await Promise.all([f.lifecycle.expireBatch(),f.lifecycle.expireBatch()]);await Promise.all([f.lifecycle.refundBatch(),f.lifecycle.refundBatch()]);
 const rows=await db.order.findMany({where:{requesterId:f.user}});assert.equal(rows.length,3);for(const r of rows){assert.equal(r.status,'CANCELLED');assert.equal(r.cancellationReason,'EXPIRY');assert.equal(r.creditState,'REFUNDED')}
});
test('edit adjusts reservation, updates fields and replays without duplicate credit updates',async()=>{
 const f=fixture(),order=await create(f);const patch=editOrderSchema.parse({credits:6,destination:'Utown'});const r=await f.edits.edit(order.id,f.user,'edit-one',patch);assert.equal(r.status,200,String(r.error));assert.equal(r.order.credits,6);assert.equal(r.order.destination,'Utown');assert.equal(f.updates,1);
 assert.equal((await f.edits.edit(order.id,f.user,'edit-one',patch)).status,200);assert.equal(f.updates,1);
 assert.equal((await f.edits.edit(order.id,f.user,'edit-one',{credits:7})).status,409);
 const lower=await f.edits.edit(order.id,f.user,'lower',{credits:2});assert.equal(lower.status,200);assert.equal(f.ledger.get(order.id).amount,2);
});
test('credit-edit timeout resumes against current version without applying the mutation twice',async()=>{
 const f=fixture(),order=await create(f);f.updateMode='after';const r=await f.edits.edit(order.id,f.user,'uncertain-edit',{credits:7});assert.equal(r.status,202);assert.equal(r.order.credits,4);await editDue(order.id);
 await createOrderEdits(db,f.credit,f.directories).recoverBatch();const updated=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(updated.credits,7);assert.equal(f.updates,1);
});
test('edits reject other users, accepted orders, closed suppliers and permanent credit rejection',async()=>{
 const f=fixture(),order=await create(f);assert.equal((await f.edits.edit(order.id,'other','x',{destination:'Elsewhere'})).status,403);f.closed=true;assert.equal((await f.edits.edit(order.id,f.user,'closed',{destination:'Elsewhere'})).status,409);f.closed=false;
 f.updateMode='reject';assert.equal((await f.edits.edit(order.id,f.user,'reject',{credits:19})).status,409);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,4);
 await db.order.update({where:{id:order.id},data:{status:'ASSIGNED',courierId:'courier',acceptedAt:new Date()}});assert.equal((await f.edits.edit(order.id,f.user,'assigned',{destination:'Elsewhere'})).status,409);assert.equal((await f.lifecycle.cancel(order.id,f.user)).status,409);
});
test('recovery stops after initial attempt plus five retries and retains unresolved state',async()=>{
 const f=fixture();f.unavailable=true;const r=await f.creation.submit(f.user,'exhaust',f.input());assert.equal(r.status,202);
 for(let i=0;i<5;i++){await due(r.creationId);await f.creation.recoverBatch()}
 let op=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:r.creationId,type:'RESERVE'}}});assert.equal(op.attempts,6);assert.equal(op.state,'PERMANENTLY_FAILED');await f.creation.recoverBatch();op=await db.creditOperation.findUniqueOrThrow({where:{id:op.id}});assert.equal(op.attempts,6);assert.equal((await db.orderCreation.findUniqueOrThrow({where:{orderId:r.creationId}})).state,'PENDING');
});
test('HTTP create/edit/cancel uses JWT identity, validates input and serializes bigint/date fields',async t=>{
 const f=fixture();const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const token=jwt.sign({roles:['USER']},privateKey,{algorithm:'RS256',subject:f.user,expiresIn:60});
 const app=createApp(publicKey.export({type:'spki',format:'pem'}),f.lifecycle,f.creation,f.edits);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/orders';
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':'http'};
 assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({})})).status,400);
 let response=await fetch(base,{method:'POST',headers,body:JSON.stringify(f.input())});assert.equal(response.status,201);let body=await response.json();assert.equal(body.order.supplierId,'1');assert.equal(body.order.requesterId,f.user);assert.ok(body.order.createdAt.endsWith('Z'));const id=body.order.id;
 response=await fetch(base+'/'+id,{method:'PATCH',headers:{...headers,'Idempotency-Key':'http-edit'},body:JSON.stringify({destination:'Library'})});assert.equal(response.status,200);
 response=await fetch(base+'/'+id+'/cancel',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);assert.equal((await response.json()).order.creditState,'REFUNDED');
});

test('background worker recovers pending creation without another client request',async()=>{
 const f=fixture();f.reserveMode='after';const r=await f.creation.submit(f.user,'automatic',f.input());assert.equal(r.status,202);await due(r.creationId);
 const worker=createOrderLifecycle(db,f.credit,[()=>f.creation.recoverBatch(),()=>f.edits.recoverBatch()]);worker.startWorker();
 try {const deadline=Date.now()+5000;while(Date.now()<deadline){if(await db.order.count({where:{id:r.creationId}}))break;await new Promise(r=>setTimeout(r,50))}assert.equal(await db.order.count({where:{id:r.creationId}}),1);assert.equal(f.calls,1)}finally{await worker.stopWorker()}
});
test('worker reclaims an expired processing lease after a crashed reservation attempt',async()=>{
 const f=fixture();f.reserveMode='after';const r=await f.creation.submit(f.user,'crashed',f.input());await db.creditOperation.updateMany({where:{orderId:r.creationId,type:'RESERVE'},data:{state:'PROCESSING',leaseExpiresAt:new Date(0)}});
 await f.creation.recoverBatch();assert.equal(await db.order.count({where:{id:r.creationId}}),1);assert.equal(f.calls,1);
});
test('editing is blocked by a courier assignment that acquired the row lock first',async()=>{
 const f=fixture(),order=await create(f);let release;const gate=new Promise(r=>release=r);let locked;const ready=new Promise(r=>locked=r);
 const acceptance=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id}::uuid FOR UPDATE`;locked();await gate;await tx.order.update({where:{id:order.id},data:{status:'ASSIGNED',courierId:'courier',acceptedAt:new Date()}})});
 await ready;const editing=f.edits.edit(order.id,f.user,'race',{credits:6});release();await acceptance;assert.equal((await editing).status,409);assert.equal(f.updates,0);
});
test('durable in-progress edit excludes another edit and cancellation until recovery completes',async()=>{
 const f=fixture(),order=await create(f);f.updateMode='after';assert.equal((await f.edits.edit(order.id,f.user,'pending-edit',{credits:6})).status,202);
 assert.equal((await f.edits.edit(order.id,f.user,'other-edit',{destination:'Elsewhere'})).status,409);assert.equal((await f.lifecycle.cancel(order.id,f.user)).status,409);
 await editDue(order.id);await f.edits.recoverBatch();assert.equal((await f.lifecycle.cancel(order.id,f.user)).order.creditState,'REFUNDED');
});
test('expiry releases the updated hold even if edit persistence has not completed',async()=>{
 const f=fixture(),order=await create(f);f.updateMode='after';assert.equal((await f.edits.edit(order.id,f.user,'edit-before-expiry',{credits:8})).status,202);
 assert.equal(f.ledger.get(order.id).amount,8);await db.order.update({where:{id:order.id},data:{expiryTime:new Date(Date.now()-1000)}});await f.lifecycle.expireBatch();await f.lifecycle.refundBatch();
 const row=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(row.creditState,'REFUNDED');assert.equal(f.ledger.get(order.id).status,'RELEASED');assert.equal((await db.orderEditOperation.findFirstOrThrow({where:{orderId:order.id}})).state,'FAILED');
});
test('unresolved edits exhaust five retries into RECONCILIATION_REQUIRED',async()=>{
 const f=fixture(),order=await create(f);f.updateMode='after';assert.equal((await f.edits.edit(order.id,f.user,'edit-exhaust',{credits:8})).status,202);f.unavailable=true;
 for(let i=0;i<5;i++){await editDue(order.id);await f.edits.recoverBatch()}
 const op=await db.orderEditOperation.findFirstOrThrow({where:{orderId:order.id}});assert.equal(op.attempts,6);assert.equal(op.state,'RECONCILIATION_REQUIRED');assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,4);
});

test('creation integrates real User/Supplier/Credit gRPC adapters with PostgreSQL',async t=>{
 const f=fixture();const rpc=require('@foc/grpc');const grpc=require('@grpc/grpc-js');
 const {createDirectories}=require('../dist/dependencies/directories');const {createCreditClient}=require('@foc/grpc');
 const userServer=rpc.createServer(rpc.UserService.service,{GetPublicProfile:(call,cb)=>cb(null,{userId:call.request.userId,username:'student',firstName:'Campus',lastName:'Friend'})});
 const supplierServer=rpc.createServer(rpc.SupplierService.service,{GetSupplier:(call,cb)=>cb(null,{supplierId:call.request.supplierId,name:'Cafe',buildingName:'NUS',floor:1,latitude:1.3,longitude:103.77}),IsOpen:(_call,cb)=>cb(null,{isOpen:true})});
 const creditServer=new grpc.Server();const CreditService=rpc.CreditService;
 const handlers={};for(const [wire,method] of [['GetBalance','getBalance'],['GetReservation','getReservation'],['ReserveCredits','reserveCredits'],['UpdateReservation','updateReservation'],['ReleaseCredits','releaseCredits'],['SettleCredits','settleCredits']])handlers[wire]=(call,cb)=>{
  if(call.metadata.get('x-credit-service-token')[0]!=='integration-token'){cb({code:16});return}
  Promise.resolve().then(()=>f.credit[method](call.request)).then(value=>cb(null,value),error=>cb(error));
 };
 creditServer.addService(CreditService.service,handlers);
 const ports=await Promise.all([userServer,supplierServer,creditServer].map(server=>rpc.startServer(server,0,'127.0.0.1')));
 const dirs=createDirectories('127.0.0.1:'+ports[0],'127.0.0.1:'+ports[1],1000);const credit=createCreditClient('127.0.0.1:'+ports[2],{timeoutMs:1000});const metadata=new grpc.Metadata();metadata.set('x-credit-service-token','integration-token');const creditOptions={metadata};
 t.after(()=>{dirs.close();credit.close();userServer.forceShutdown();supplierServer.forceShutdown();creditServer.forceShutdown()});
 const service=createOrderCreation(db,credit,dirs,creditOptions);const r=await service.submit(f.user,'real-grpc',f.input());assert.equal(r.status,201);assert.equal(r.order.status,'UNASSIGNED');assert.equal(f.ledger.get(r.order.id).status,'RESERVED');
 assert.equal(r.order.pickupLocation,'-');const snapshot=await dirs.getSupplier('1');assert.equal(snapshot.buildingName,'NUS');assert.equal(snapshot.floor,1);assert.equal(snapshot.latitude,1.3);assert.equal(snapshot.locationDescription,'-');
 const edited=await createOrderEdits(db,credit,dirs,creditOptions).edit(r.order.id,f.user,'real-grpc-edit',editOrderSchema.parse({destination:'Library'}));assert.equal(edited.order.pickupLocation,'-');
 const cancellation=await createOrderLifecycle(db,credit,[],creditOptions).cancel(r.order.id,f.user);assert.equal(cancellation.order.creditState,'REFUNDED');assert.equal(f.ledger.get(r.order.id).status,'RELEASED');
});

test('pending creation compensates instead of publishing when supplier is now closed',async()=>{
 const f=fixture();f.reserveMode='after';const r=await f.creation.submit(f.user,'closed-during-recovery',f.input());assert.equal(r.status,202);f.closed=true;await due(r.creationId);await f.creation.recoverBatch();
 assert.equal(await db.order.count({where:{id:r.creationId}}),0);assert.equal(f.ledger.get(r.creationId).status,'RELEASED');assert.equal((await db.orderCreation.findUniqueOrThrow({where:{orderId:r.creationId}})).state,'FAILED');
});

test('administrator GET /orders includes all statuses and history with role separation and public fields',async t=>{
 const f=fixture();const ids=[];
 for(const [status,reason] of [['UNASSIGNED',null],['ASSIGNED',null],['PICKED_UP',null],['DELIVERED',null],['CANCELLED','REQUESTER'],['CANCELLED','EXPIRY']]) {
  const order=await create(f,'admin-'+status+'-'+reason);ids.push(order.id);
  await db.order.update({where:{id:order.id},data:{status,cancellationReason:reason,
   ...(status==='DELIVERED'?{deliveredAt:new Date(),creditState:'SETTLED'}:{}),
   ...(status==='CANCELLED'?{cancelledAt:new Date(),creditState:'REFUNDED'}:{})}});
 }
 f.reserveMode='after';const pending=await f.creation.submit(f.user,'admin-pending',f.input());assert.equal(pending.status,202);
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const app=createApp(publicKey.export({type:'spki',format:'pem'}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/orders';
 const headers=roles=>({Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:'dashboard-admin',expiresIn:60})});
 assert.equal((await fetch(base)).status,401);
 assert.equal((await fetch(base,{headers:headers(['USER'])})).status,403);
 for(const roles of [['ADMINISTRATOR'],['USER','ADMINISTRATOR']]) {
  const response=await fetch(base,{headers:headers(roles)});assert.equal(response.status,200);const body=await response.json();assert.ok(Array.isArray(body.orders));
  const ownFixtures=body.orders.filter(order=>ids.includes(order.id));assert.equal(ownFixtures.length,6);assert.ok(!body.orders.some(order=>order.id===pending.creationId));
  assert.ok(ownFixtures.some(order=>order.status==='DELIVERED'));assert.ok(ownFixtures.some(order=>order.cancellationReason==='EXPIRY'));
  for(const order of ownFixtures){assert.equal(order.requesterId,f.user);assert.equal(order.supplierId,'1');assert.ok(order.createdAt.endsWith('Z'));assert.ok(!('payload' in order));assert.ok(!('creation' in order));assert.ok(!('idempotencyKey' in order));assert.ok(!('creditOperations' in order));assert.ok(!('editOperations' in order));}
 }
 // Administrator-only access to reads does not grant USER command permissions.
 assert.equal((await fetch(base,{method:'POST',headers:{...headers(['ADMINISTRATOR']),'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base,{method:'POST',headers:{...headers(['USER']),'Content-Type':'application/json'},body:'{}'})).status,400);
});

test('cancellation HTTP rejects missing credentials, wrong owner, invalid input and ineligible states',async t=>{
 const f=fixture(),order=await create(f);const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const app=createApp(publicKey.export({type:'spki',format:'pem'}),f.lifecycle);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/orders';
 const headers=(id=f.user,roles=['USER'])=>({Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:id,expiresIn:60}),'Content-Type':'application/json'});
 const cancel=(id,h=headers(),body='{}')=>fetch(base+'/'+id+'/cancel',{method:'POST',headers:h,body});
 assert.equal((await cancel(order.id,{'Content-Type':'application/json'})).status,401);
 assert.equal((await cancel(order.id,headers('other'))).status,403);
 assert.equal((await cancel(order.id,headers(f.user,['ADMINISTRATOR']))).status,403);
 assert.equal((await cancel('not-a-uuid')).status,400);assert.equal((await cancel(order.id,headers(),'{broken')).status,400);
 assert.equal((await cancel(order.id,headers(),JSON.stringify({requesterId:'forged'}))).status,400);
 assert.equal((await cancel(randomUUID())).status,404);
 for(const status of ['ASSIGNED','PICKED_UP','DELIVERED']){await db.order.update({where:{id:order.id},data:{status}});assert.equal((await cancel(order.id)).status,409)}
 await db.order.update({where:{id:order.id},data:{status:'UNASSIGNED',expiryTime:new Date(Date.now()-1000)}});assert.equal((await cancel(order.id)).status,409);assert.equal(f.releases,0);
 await f.lifecycle.expireBatch();await f.lifecycle.refundBatch();assert.equal(f.ledger.get(order.id).status,'RELEASED');
});
test('concurrent cancellation requests share one refund and retain one order history record',async()=>{
 const f=fixture(),order=await create(f);const results=await Promise.all(Array.from({length:4},()=>f.lifecycle.cancel(order.id,f.user)));
 assert.ok(results.every(r=>r.order.status==='CANCELLED'));assert.equal(f.releases,1);assert.equal(await db.creditOperation.count({where:{orderId:order.id,type:'REFUND'}}),1);assert.equal(await db.order.count({where:{id:order.id}}),1);
});
test('release failure before commit leaves durable REFUND_PENDING and recovers after restart',async()=>{
 const f=fixture(),order=await create(f);f.releaseMode='before';const r=await f.lifecycle.cancel(order.id,f.user);assert.equal(r.order.creditState,'REFUND_PENDING');assert.equal(f.ledger.get(order.id).status,'RESERVED');
 const op=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'REFUND'}}});assert.equal(op.state,'PENDING');assert.equal(op.lastError,'outcome-uncertain');assert.ok(+op.nextRetryAt> Date.now());
 await due(order.id,'REFUND');await createOrderLifecycle(db,f.credit).refundBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUNDED');assert.equal(f.releases,2);
});
test('explicit release rejection is retained for reconciliation without automatic business retries',async()=>{
 const f=fixture(),order=await create(f);f.releaseMode='reject';assert.equal((await f.lifecycle.cancel(order.id,f.user)).order.creditState,'REFUND_PENDING');
 const op=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'REFUND'}}});assert.equal(op.state,'PERMANENTLY_FAILED');assert.equal(op.lastError,'dependency-rejected');await f.lifecycle.refundBatch();assert.equal(f.releases,1);assert.equal(f.ledger.get(order.id).status,'RESERVED');
});
test('historical release response and wrong-owner receipt cannot falsely confirm refunds',async()=>{
 const f=fixture(),order=await create(f);f.releaseMode='stale';assert.equal((await f.lifecycle.cancel(order.id,f.user)).order.creditState,'REFUND_PENDING');assert.equal(f.ledger.get(order.id).status,'RESERVED');
 f.ledger.get(order.id).requesterId='wrong-owner';await due(order.id,'REFUND');await f.lifecycle.refundBatch();assert.equal(f.releases,1);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUND_PENDING');
 f.ledger.get(order.id).requesterId=f.user;f.releaseMode=undefined;await due(order.id,'REFUND');await f.lifecycle.refundBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUNDED');
});
test('refund attempts stop after five retries and preserve unresolved financial state',async()=>{
 const f=fixture(),order=await create(f);f.unavailable=true;assert.equal((await f.lifecycle.cancel(order.id,f.user)).order.creditState,'REFUND_PENDING');
 for(let i=0;i<5;i++){await due(order.id,'REFUND');await f.lifecycle.refundBatch()}
 const op=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'REFUND'}}});assert.equal(op.attempts,6);assert.equal(op.state,'PERMANENTLY_FAILED');assert.equal(op.lastError,'retry-exhausted');await f.lifecycle.refundBatch();assert.equal((await db.creditOperation.findUniqueOrThrow({where:{id:op.id}})).attempts,6);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUND_PENDING');assert.equal(f.ledger.get(order.id).status,'RESERVED');
});
test('receipt persistence failure after Credit release returns pending and reclaims expired lease',async()=>{
 const f=fixture(),order=await create(f);let fail=true;
 const broken=new Proxy(db,{get(target,key){if(key==='$transaction')return(fn,...rest)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='creditOperation')return new Proxy(t.creditOperation,{get(o,m){if(m==='updateMany')return async(args)=>{if(fail&&args.data.state==='SUCCEEDED'){fail=false;throw new Error('injected receipt write failure')}return o.updateMany(args)};return o[m]}});return t[k]}})),...rest);const value=target[key];return typeof value==='function'?value.bind(target):value}});
 const result=await createOrderLifecycle(broken,f.credit).cancel(order.id,f.user);assert.equal(result.order.status,'CANCELLED');assert.equal(result.order.creditState,'REFUND_PENDING');assert.equal(f.ledger.get(order.id).status,'RELEASED');
 await db.creditOperation.updateMany({where:{orderId:order.id,type:'REFUND'},data:{leaseExpiresAt:new Date(0)}});await f.lifecycle.refundBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'REFUNDED');assert.equal(f.releases,1);
});
test('automatic expiry worker ignores future and delivered orders and refunds overdue picked-up order',async()=>{
 const f=fixture(),future=await create(f,'future'),delivered=await create(f,'delivered'),overdue=await create(f,'overdue');
 await db.order.update({where:{id:delivered.id},data:{status:'DELIVERED',creditState:'SETTLED',expiryTime:new Date(Date.now()-1000)}});
 await db.order.update({where:{id:overdue.id},data:{status:'PICKED_UP',expiryTime:new Date(Date.now()-1000)}});
 f.lifecycle.startWorker();try{const deadline=Date.now()+5000;while(Date.now()<deadline){if((await db.order.findUniqueOrThrow({where:{id:overdue.id}})).creditState==='REFUNDED')break;await new Promise(r=>setTimeout(r,50))}}finally{await f.lifecycle.stopWorker()}
 assert.equal((await db.order.findUniqueOrThrow({where:{id:future.id}})).status,'UNASSIGNED');assert.equal((await db.order.findUniqueOrThrow({where:{id:delivered.id}})).status,'DELIVERED');const row=await db.order.findUniqueOrThrow({where:{id:overdue.id}});assert.equal(row.cancellationReason,'EXPIRY');assert.equal(row.creditState,'REFUNDED');
});

test('acceptance persists courier identity, timestamp and ASSIGNED without new credit mutations',async()=>{
 const f=fixture(),order=await create(f);const acceptance=createOrderAcceptance(db);const actor={id:'courier-'+randomUUID(),roles:['USER']};
 const response=await acceptance.accept(order.id,actor);assert.equal(response.status,200);assert.equal(response.order.status,'ASSIGNED');assert.equal(response.order.courierId,actor.id);assert.ok(response.order.acceptedAt instanceof Date);assert.ok(response.order.acceptedAt>=response.order.createdAt);assert.equal(response.order.creditState,'RESERVED');
 const stored=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(stored.courierId,actor.id);assert.equal(stored.status,'ASSIGNED');assert.equal(f.calls,1);assert.equal(f.updates,0);assert.equal(f.releases,0);
 assert.equal((await acceptance.accept(order.id,actor)).status,409);assert.equal((await acceptance.accept(order.id,{id:'another',roles:['USER']})).status,409);
});
test('twelve concurrent couriers yield exactly one successful acceptance and one persisted winner',async()=>{
 const f=fixture(),order=await create(f);const acceptance=createOrderAcceptance(db);const actors=Array.from({length:12},(_,i)=>({id:'courier-'+i+'-'+randomUUID(),roles:['USER']}));
 const results=await Promise.all(actors.map(actor=>acceptance.accept(order.id,actor)));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,11);
 const winner=results.findIndex(r=>r.status===200);const stored=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(stored.courierId,actors[winner].id);assert.equal(stored.status,'ASSIGNED');assert.equal(f.calls,1);
});
test('acceptance and cancellation races commit only one eligible transition',async()=>{
 const f=fixture(),order=await create(f);const acceptance=createOrderAcceptance(db);
 const [accepted,cancelled]=await Promise.all([acceptance.accept(order.id,{id:'courier',roles:['USER']}),f.lifecycle.cancel(order.id,f.user)]);
 const stored=await db.order.findUniqueOrThrow({where:{id:order.id}});
 if(accepted.status===200){assert.equal(cancelled.status,409);assert.equal(stored.status,'ASSIGNED');assert.equal(stored.courierId,'courier');assert.equal(f.releases,0)}
 else{assert.equal(accepted.status,409);assert.equal(cancelled.order.status,'CANCELLED');assert.equal(stored.courierId,null);assert.equal(stored.creditState,'REFUNDED');assert.equal(f.releases,1)}
});
test('pending durable edit blocks acceptance until credit reconciliation completes',async()=>{
 const f=fixture(),order=await create(f);const acceptance=createOrderAcceptance(db);const actor={id:'courier',roles:['USER']};f.updateMode='after';assert.equal((await f.edits.edit(order.id,f.user,'accept-edit',{credits:6})).status,202);
 const blocked=await acceptance.accept(order.id,actor);assert.equal(blocked.status,409);assert.equal(blocked.error,'conflict');await editDue(order.id);await f.edits.recoverBatch();
 const accepted=await acceptance.accept(order.id,actor);assert.equal(accepted.status,200);assert.equal(accepted.order.credits,6);
});
test('acceptance rechecks database expiry after waiting for the row lock',async()=>{
 const f=fixture(),order=await create(f);let locked;const ready=new Promise(r=>locked=r);let release;const gate=new Promise(r=>release=r);
 const blocker=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id}::uuid FOR UPDATE`;await tx.order.update({where:{id:order.id},data:{expiryTime:new Date(Date.now()+100)}});locked();await gate});
 await ready;const pending=createOrderAcceptance(db).accept(order.id,{id:'courier',roles:['USER']});await new Promise(r=>setTimeout(r,150));release();await blocker;
 const result=await pending;assert.equal(result.status,409);assert.equal(result.error,'expired');assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).courierId,null);
 await f.lifecycle.expireBatch();await f.lifecycle.refundBatch();
});
test('acceptance HTTP derives courier from JWT and enforces eligibility without Credit configuration',async t=>{
 const f=fixture(),order=await create(f);const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const app=createApp(publicKey.export({type:'spki',format:'pem'}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/orders';
 const actor='courier-'+randomUUID();const headers=(id=actor,roles=['USER'])=>({Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:id,expiresIn:60}),'Content-Type':'application/json'});
 const accept=(id,h=headers(),body='{}')=>fetch(base+'/'+id+'/accept',{method:'POST',headers:h,body});
 assert.equal((await accept(order.id,{'Content-Type':'application/json'})).status,401);assert.equal((await accept(order.id,headers(f.user))).status,403);assert.equal((await accept(order.id,headers(actor,['ADMINISTRATOR']))).status,403);
 assert.equal((await accept('invalid-uuid')).status,400);assert.equal((await accept(randomUUID())).status,404);assert.equal((await accept(order.id,headers(),JSON.stringify({courierId:'forged'}))).status,400);
 const response=await accept(order.id,headers(actor,['USER','ADMINISTRATOR']));assert.equal(response.status,200);const result=await response.json();assert.equal(result.order.courierId,actor);assert.equal(result.order.status,'ASSIGNED');assert.equal(result.order.supplierId,'1');assert.ok(result.order.acceptedAt.endsWith('Z'));
 assert.equal((await accept(order.id)).status,409);assert.equal(f.calls,1);assert.equal(f.releases,0);
});

// AI-assisted retrieval coverage: exact approved scopes and JWT relationship filtering.
test('USER retrieval scopes enforce ownership, expiry and historical visibility', async t => {
 const f=fixture(), other=fixture(); const user=f.user;
 const own=await create(f,'retrieval-own');
 const available=await create(other,'retrieval-open');
 const expired=await create(other,'retrieval-expired');
 const assigned=await create(other,'retrieval-assigned');
 const delivered=await create(other,'retrieval-delivered');
 const cancelled=await create(f,'retrieval-cancelled');
 const someoneElse=await create(other,'retrieval-other-courier');
 await db.order.update({where:{id:expired.id},data:{expiryTime:new Date(Date.now()-1000)}});
 await db.order.update({where:{id:assigned.id},data:{status:'ASSIGNED',courierId:user,acceptedAt:new Date()}});
 await db.order.update({where:{id:delivered.id},data:{status:'DELIVERED',courierId:user,acceptedAt:new Date(),pickedUpAt:new Date(),deliveredAt:new Date(),creditState:'SETTLED'}});
 await db.order.update({where:{id:cancelled.id},data:{status:'CANCELLED',cancellationReason:'REQUESTER',cancelledAt:new Date(),creditState:'REFUNDED'}});
 await db.order.update({where:{id:someoneElse.id},data:{status:'ASSIGNED',courierId:other.user,acceptedAt:new Date()}});
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const server=createApp(publicKey.export({type:'spki',format:'pem'})).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/orders';
 const headers=(sub=user,roles=['USER'])=>({Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:sub,expiresIn:60})});
 const get=async(scope,sub=user,roles=['USER'])=>{
  const response=await fetch(base+'?scope='+scope,{headers:headers(sub,roles)});assert.equal(response.status,200);return (await response.json()).orders;
 };
 const open=await get('open');assert.ok(open.some(o=>o.id===available.id));
 for(const id of [own.id,expired.id,assigned.id,delivered.id,cancelled.id,someoneElse.id])assert.ok(!open.some(o=>o.id===id));
 assert.ok(open.every(o=>o.status==='UNASSIGNED'&&o.requesterId!==user&&new Date(o.expiryTime)>new Date()));
 const requested=await get('requested');assert.deepEqual(new Set(requested.map(o=>o.id)),new Set([own.id,cancelled.id]));
 const courier=await get('assigned');assert.deepEqual(new Set(courier.map(o=>o.id)),new Set([assigned.id,delivered.id]));
 for(const rows of [open,requested,courier])for(const order of rows){
  assert.equal(typeof order.id,'string');assert.equal(typeof order.status,'string');assert.equal(typeof order.destination,'string');assert.equal(typeof order.credits,'number');
  assert.ok(!('creation' in order));assert.ok(!('payload' in order));assert.ok(!('creditOperations' in order));
 }
 assert.deepEqual(await get('requested',prefix+'-empty'),[]);assert.deepEqual(await get('assigned',prefix+'-empty'),[]);
 assert.equal((await fetch(base+'?scope=open')).status,401);
 assert.equal((await fetch(base+'?scope=open',{headers:headers(user,['ADMINISTRATOR'])})).status,403);
 assert.ok((await get('requested',user,['USER','ADMINISTRATOR'])).some(o=>o.id===own.id));
 for(const query of ['scope=invalid','scope=','scope=open&scope=requested','scope[foo]=open','scope=requested&requesterId='+other.user,'userId='+other.user]){
  assert.equal((await fetch(base+'?'+query,{headers:headers()})).status,400,query);
 }
 assert.equal((await fetch(base,{headers:headers()})).status,403);
 // Once the only remaining unassigned rows expire, an empty open list is still successful.
 await db.order.updateMany({where:{status:'UNASSIGNED'},data:{expiryTime:new Date(Date.now()-1000)}});
 assert.deepEqual(await get('open'),[]);
});

// Exercise production Credit client serialization, credentials and error handling
// alongside real Order PostgreSQL persistence; ledger handlers are test doubles.
// Worker-failure cases set maxAttempts:1 via shared RpcOptions to expose the
// durable retry layer; credit.test.cjs verifies the shared default wire retries.
async function grpcCreditFixture(t, f, token='test-order-token', options={}) {
 const grpc=require('@grpc/grpc-js');
 const {CreditService:service,createCreditClient}=require('@foc/grpc');
 const server=new grpc.Server(),handlers={};let calls=0;
 for(const name of ['GetBalance','GetReservation','ReserveCredits','UpdateReservation','ReleaseCredits','SettleCredits']){
  handlers[name]=async(call,cb)=>{
   if(call.metadata.get('x-credit-service-token')[0]!=='test-order-token'){cb({code:grpc.status.UNAUTHENTICATED,message:'Invalid service token'});return;}
   calls++;
   try {cb(null,await f.credit[name[0].toLowerCase()+name.slice(1)](call.request));}
   catch(error){cb({code:error.code??grpc.status.INTERNAL,message:'Test Credit operation failed',metadata:error.metadata});}
  };
 }
 server.addService(service.service,handlers);
 const port=await new Promise((resolve,reject)=>server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(error,value)=>error?reject(error):resolve(value)));
 const client=createCreditClient('127.0.0.1:'+port,{timeoutMs:1000});
 const metadata=new grpc.Metadata();metadata.set('x-credit-service-token',token);
 t.after(()=>{client.close();server.forceShutdown();});
 return {client,options:{metadata,...options},get calls(){return calls}};
}

test('real Credit gRPC reserves creation and confirms cancellation and expiry releases',async t=>{
 const f=fixture(),transport=await grpcCreditFixture(t,f);
 const creation=createOrderCreation(db,transport.client,f.directories,transport.options),lifecycle=createOrderLifecycle(db,transport.client,[],transport.options);
 const input=f.input();const created=await creation.submit(f.user,'grpc-create',input);assert.equal(created.status,201);
 assert.equal(created.order.creditState,'RESERVED');assert.equal(f.ledger.get(created.order.id).amount,4);
 const replay=await creation.submit(f.user,'grpc-create',input);
 assert.equal(replay.status,200);assert.equal(replay.order.id,created.order.id);assert.equal(f.calls,1);
 const cancelled=await lifecycle.cancel(created.order.id,f.user);assert.equal(cancelled.order.creditState,'REFUNDED');
 assert.equal(f.ledger.get(created.order.id).status,'RELEASED');assert.equal(f.releases,1);
 const expiring=await creation.submit(f.user,'grpc-expiry',f.input());assert.equal(expiring.status,201);
 await db.order.update({where:{id:expiring.order.id},data:{expiryTime:new Date(0)}});
 await lifecycle.expireBatch();await lifecycle.refundBatch();
 const expired=await db.order.findUniqueOrThrow({where:{id:expiring.order.id}});
 assert.equal(expired.status,'CANCELLED');assert.equal(expired.cancellationReason,'EXPIRY');assert.equal(expired.creditState,'REFUNDED');
 assert.ok(transport.calls>0);
});

test('real Credit gRPC business rejection, uncertain outcomes and invalid token never falsely complete',async t=>{
 const f=fixture(),transport=await grpcCreditFixture(t,f,'test-order-token',{maxAttempts:1}),creation=createOrderCreation(db,transport.client,f.directories,transport.options);
 f.reserveMode='reject';const rejected=await creation.submit(f.user,'grpc-rejected',f.input());assert.equal(rejected.status,409);
 assert.equal(await db.order.count({where:{requesterId:f.user}}),0);
 f.reserveMode='after';const pending=await creation.submit(f.user,'grpc-uncertain',f.input());assert.equal(pending.status,202);
 assert.equal(await db.order.count({where:{id:pending.creationId}}),0);
 await due(pending.creationId);await creation.recoverBatch();
 const recovered=await db.order.findUniqueOrThrow({where:{id:pending.creationId}});assert.equal(recovered.creditState,'RESERVED');
 const lifecycle=createOrderLifecycle(db,transport.client,[],transport.options);f.releaseMode='before';
 const cancellation=await lifecycle.cancel(recovered.id,f.user);assert.equal(cancellation.order.creditState,'REFUND_PENDING');
 assert.equal(f.ledger.get(recovered.id).status,'RESERVED');
 await due(recovered.id,'REFUND');await lifecycle.refundBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:recovered.id}})).creditState,'REFUNDED');
 const denied=await grpcCreditFixture(t,f,'incorrect-token');
 const unauthorized=await createOrderCreation(db,denied.client,f.directories,denied.options).submit(f.user,'grpc-unauthorized',f.input());
 assert.equal(unauthorized.status,202);assert.equal(denied.calls,0);
 assert.equal(await db.order.count({where:{id:unauthorized.creationId}}),0);
 assert.equal((await db.orderCreation.findUniqueOrThrow({where:{orderId:unauthorized.creationId}})).state,'PENDING');
});

async function pickedUp(f, key='delivery') {
 const order=await create(f,key);
 return db.order.update({where:{id:order.id},data:{status:'PICKED_UP',courierId:f.user+'-courier',acceptedAt:new Date(),pickedUpAt:new Date()}});
}

test('delivery over real Credit gRPC settles once to the assigned courier and replays safely',async t=>{
 const f=fixture(),wire=await grpcCreditFixture(t,f),lifecycle=createOrderLifecycle(db,wire.client,[],wire.options),order=await pickedUp(f);
 const result=await lifecycle.deliver(order.id,order.courierId);assert.equal(result.order.status,'DELIVERED');assert.equal(result.order.creditState,'SETTLED');assert.ok(result.order.deliveredAt);
 const receipt=await wire.client.getReservation({orderId:order.id},wire.options);assert.equal(receipt.status,'SETTLED');assert.equal(receipt.courierId,order.courierId);assert.equal(receipt.amount,order.credits);
 const replay=await lifecycle.deliver(order.id,order.courierId);assert.equal(replay.order.creditState,'SETTLED');assert.equal(f.settlements,1);
 assert.equal((await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'SETTLE'}}})).state,'SUCCEEDED');
 await db.order.update({where:{id:order.id},data:{expiryTime:new Date(0)}});await lifecycle.expireBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'DELIVERED');
});

for(const mode of ['before','after'])test('delivery '+mode+'-commit Credit failure recovers automatically without duplicate transfer',async t=>{
 const f=fixture(),wire=await grpcCreditFixture(t,f,'test-order-token',{maxAttempts:1}),order=await pickedUp(f);f.settleMode=mode;
 const lifecycle=createOrderLifecycle(db,wire.client,[],wire.options);const result=await lifecycle.deliver(order.id,order.courierId);
 assert.equal(result.order.status,'DELIVERED');assert.equal(result.order.creditState,'SETTLEMENT_PENDING');
 await due(order.id,'SETTLE');const recovered=createOrderLifecycle(db,wire.client,[],wire.options);recovered.startWorker();t.after(()=>recovered.stopWorker());
 const deadline=Date.now()+3000;let stored;
 do {stored=await db.order.findUniqueOrThrow({where:{id:order.id}});if(stored.creditState==='SETTLED')break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);
 assert.equal(stored.creditState,'SETTLED');assert.equal(f.ledger.get(order.id).courierId,order.courierId);assert.equal(f.settlements,mode==='after'?1:2);
});

test('settlement rejection, stale receipts, wrong identity and exhausted retries never mark SETTLED',async()=>{
 for(const mode of ['reject','stale','wrong-courier','wrong-amount']) {
  const f=fixture(),order=await pickedUp(f);f.settleMode=mode==='reject'?'reject':'stale';
  if(mode==='wrong-courier'){const receipt=f.ledger.get(order.id);receipt.status='SETTLED';receipt.courierId='different-courier';}
  if(mode==='wrong-amount')f.ledger.get(order.id).amount++;
  const result=await f.lifecycle.deliver(order.id,order.courierId);assert.equal(result.order.creditState,'SETTLEMENT_PENDING');
  let work=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'SETTLE'}}});
  if(mode==='reject'){assert.equal(work.state,'PERMANENTLY_FAILED');await f.lifecycle.settlementBatch();assert.equal(f.settlements,1);}
  else {for(let n=0;n<5;n++){await due(order.id,'SETTLE');await f.lifecycle.settlementBatch();}work=await db.creditOperation.findUniqueOrThrow({where:{id:work.id}});assert.equal(work.state,'PERMANENTLY_FAILED');assert.equal(work.attempts,6);}
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'SETTLEMENT_PENDING');
 }
});

test('concurrent delivery requests produce one settlement intent and transfer',async()=>{
 const f=fixture(),order=await pickedUp(f);
 const results=await Promise.all(Array.from({length:10},()=>f.lifecycle.deliver(order.id,order.courierId)));
 assert.ok(results.every(r=>r.order?.status==='DELIVERED'));assert.equal(f.settlements,1);
 assert.equal(await db.creditOperation.count({where:{orderId:order.id,type:'SETTLE'}}),1);
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'SETTLED');
});

test('delivery validates caller, transition, expiry and HTTP body before settlement',async t=>{
 const f=fixture(),order=await pickedUp(f),unassigned=await create(f,'not-picked-up');
 assert.equal((await f.lifecycle.deliver(order.id,f.user)).status,403);
 assert.equal((await f.lifecycle.deliver(order.id,'outsider')).status,403);
 await db.order.update({where:{id:unassigned.id},data:{courierId:order.courierId,status:'ASSIGNED',acceptedAt:new Date()}});
 assert.equal((await f.lifecycle.deliver(unassigned.id,order.courierId)).status,409);
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const app=createApp(publicKey.export({type:'spki',format:'pem'}),f.lifecycle);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/orders';
 const headers=(sub,roles=['USER'])=>({'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:sub,expiresIn:60})});
 const post=(id,h,body={})=>fetch(base+'/'+id+'/deliver',{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post(order.id,{})).status,401);assert.equal((await post(order.id,headers(order.courierId,['ADMINISTRATOR']))).status,403);
 assert.equal((await post('bad-id',headers(order.courierId))).status,400);assert.equal((await post(order.id,headers(order.courierId),{courierId:'forged'})).status,400);
 assert.equal((await post(randomUUID(),headers(order.courierId))).status,404);
 f.settleMode='before';let response=await post(order.id,headers(order.courierId));assert.equal(response.status,202);assert.equal((await response.json()).order.creditState,'SETTLEMENT_PENDING');
 await due(order.id,'SETTLE');await f.lifecycle.settlementBatch();response=await post(order.id,headers(order.courierId));assert.equal(response.status,200);
 const expired=await pickedUp(f,'delivery-expired');await db.order.update({where:{id:expired.id},data:{expiryTime:new Date(0)}});
 assert.equal((await f.lifecycle.deliver(expired.id,expired.courierId)).status,409);assert.equal(f.settlements,2);
});

test('settlement receipt persistence failure remains pending and expired lease recovery confirms existing transfer',async()=>{
 const f=fixture(),order=await pickedUp(f),real=f.credit.settleCredits;
 let failSave=true;
 const credit={...f.credit,settleCredits:async input=>{const result=await real(input);failSave=true;return result}};
 // Fail only the post-RPC transaction, after the durable delivery intent exists.
 const proxy=new Proxy(db,{get(target,key){
  if(key==='$transaction')return async(callback,...args)=>{
   if(failSave && f.settlements>0){failSave=false;throw new Error('simulated receipt write failure')}
   return target.$transaction(callback,...args);
  };
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 const lifecycle=createOrderLifecycle(proxy,credit),result=await lifecycle.deliver(order.id,order.courierId);
 assert.equal(result.order.creditState,'SETTLEMENT_PENDING');assert.equal(f.ledger.get(order.id).status,'SETTLED');
 const work=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'SETTLE'}}});assert.equal(work.state,'PROCESSING');
 await db.creditOperation.update({where:{id:work.id},data:{leaseExpiresAt:new Date(0)}});
 await f.lifecycle.settlementBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'SETTLED');assert.equal(f.settlements,1);
});

// AI-assisted editing issue coverage: real client transport + durable Order DB.
test('real gRPC edits increase/decrease the held amount, reject insufficient funds and skip unchanged amounts',async t=>{
 const f=fixture(),order=await create(f),wire=await grpcCreditFixture(t,f),edits=createOrderEdits(db,wire.client,f.directories,wire.options);
 const balance=()=>{const reserved=[...f.ledger.values()].filter(r=>r.status==='RESERVED').reduce((sum,r)=>sum+r.amount,0);return {reserved,available:20-reserved}};
 assert.deepEqual(balance(),{reserved:4,available:16});
 const increased=await edits.edit(order.id,f.user,'edit-all-funds',{credits:20});assert.equal(increased.status,200);assert.equal(increased.order.credits,20);assert.deepEqual(balance(),{reserved:20,available:0});
 const rejected=await edits.edit(order.id,f.user,'edit-insufficient',{credits:21,destination:'must-not-persist'});assert.equal(rejected.status,409);
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).destination,order.destination);assert.equal(f.ledger.get(order.id).amount,20);
 assert.equal((await db.orderEditOperation.findFirstOrThrow({where:{orderId:order.id,targetCredits:21}})).state,'FAILED');
 const lower=await edits.edit(order.id,f.user,'edit-lower',{credits:2});assert.equal(lower.status,200);assert.deepEqual(balance(),{reserved:2,available:18});
 const updates=f.updates,version=f.ledger.get(order.id).version;
 const plain=await edits.edit(order.id,f.user,'edit-text',{destination:'Utown',requestDetails:'Tea',credits:2});assert.equal(plain.status,200);assert.equal(plain.order.destination,'Utown');assert.equal(f.updates,updates);assert.equal(f.ledger.get(order.id).version,version);
 const replay=await edits.edit(order.id,f.user,'edit-lower',{credits:2});assert.equal(replay.status,200);assert.equal(f.updates,updates);
});

for(const mode of ['before','after'])test('credit edit '+mode+'-commit gRPC failure recovers after restart without duplicate adjustment',async t=>{
 const f=fixture(),order=await create(f),wire=await grpcCreditFixture(t,f,'test-order-token',{maxAttempts:1}),edits=createOrderEdits(db,wire.client,f.directories,wire.options);f.updateMode=mode;
 const result=await edits.edit(order.id,f.user,'edit-grpc-'+mode,{credits:7});assert.equal(result.status,202);assert.equal(result.order.credits,4);
 const op=await db.orderEditOperation.findFirstOrThrow({where:{orderId:order.id}});assert.equal(op.expectedVersion,1);assert.equal(op.targetCredits,7);
 assert.equal((await edits.edit(order.id,f.user,'another-pending-edit',{credits:8})).status,409);
 assert.equal((await createOrderAcceptance(db).accept(order.id,{id:f.user+'-courier',roles:['USER']})).status,409);
 await editDue(order.id);const restarted=createOrderEdits(db,wire.client,f.directories,wire.options);await restarted.recoverBatch();
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,7);assert.equal(f.ledger.get(order.id).amount,7);assert.equal(f.ledger.get(order.id).version,2);assert.equal(f.updates,mode==='after'?1:2);
 assert.equal((await restarted.edit(order.id,f.user,'edit-grpc-'+mode,{credits:7})).status,200);assert.equal(f.ledger.get(order.id).version,2);
});

test('concurrent same-key edits over gRPC produce one operation and one reservation adjustment',async t=>{
 const f=fixture(),order=await create(f),wire=await grpcCreditFixture(t,f),edits=createOrderEdits(db,wire.client,f.directories,wire.options);
 const results=await Promise.all(Array.from({length:10},()=>edits.edit(order.id,f.user,'edit-concurrent',{credits:8})));
 assert.ok(results.every(r=>r.status===200||r.status===202));await edits.recoverBatch();
 assert.equal(await db.orderEditOperation.count({where:{orderId:order.id}}),1);assert.equal(f.updates,1);assert.equal(f.ledger.get(order.id).version,2);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,8);
 assert.equal((await edits.edit(order.id,f.user,'edit-concurrent',{credits:9})).status,409);
});

test('edit and actual acceptance racing over the same row leave matching order and credit state',async t=>{
 for(let n=0;n<4;n++){
  const f=fixture(),order=await create(f),wire=await grpcCreditFixture(t,f),edits=createOrderEdits(db,wire.client,f.directories,wire.options),acceptance=createOrderAcceptance(db);
  const [edit,accept]=await Promise.all([edits.edit(order.id,f.user,'edit-accept-race',{credits:6}),acceptance.accept(order.id,{id:f.user+'-courier',roles:['USER']})]);
  const stored=await db.order.findUniqueOrThrow({where:{id:order.id}}),receipt=f.ledger.get(order.id);
  assert.equal(stored.credits,receipt.amount);
  if(edit.status===409){assert.equal(accept.status,200);assert.equal(stored.status,'ASSIGNED');assert.equal(f.updates,0);}
  else {assert.equal(edit.status,200);assert.ok(accept.status===409||accept.status===200);assert.equal(receipt.amount,6);assert.equal(f.updates,1);}
 }
});

test('credit-changing edit receipt-write crash is recovered from its expired processing lease',async t=>{
 const f=fixture(),order=await create(f),wire=await grpcCreditFixture(t,f);let rejectWrite=true;
 const proxy=new Proxy(db,{get(target,key){
  if(key==='$transaction')return async(callback,...args)=>{if(rejectWrite&&f.updates>0){rejectWrite=false;throw new Error('simulated edit receipt failure')}return target.$transaction(callback,...args)};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 const result=await createOrderEdits(proxy,wire.client,f.directories,wire.options).edit(order.id,f.user,'edit-save-crash',{credits:9});assert.equal(result.status,202);assert.equal(result.order.credits,4);assert.equal(f.ledger.get(order.id).amount,9);
 const operation=await db.orderEditOperation.findFirstOrThrow({where:{orderId:order.id}});assert.equal(operation.state,'PROCESSING');
 await db.orderEditOperation.update({where:{id:operation.id},data:{leaseExpiresAt:new Date(0)}});
 await createOrderEdits(db,wire.client,f.directories,wire.options).recoverBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,9);assert.equal(f.updates,1);
});

test('editing rejects terminal states, invalid suppliers, short expiry and unavailable preflight without mutations',async t=>{
 const f=fixture(),wire=await grpcCreditFixture(t,f),edits=createOrderEdits(db,wire.client,f.directories,wire.options);
 for(const status of ['ASSIGNED','PICKED_UP','DELIVERED','CANCELLED']){
  const order=await create(f,'edit-terminal-'+status);await db.order.update({where:{id:order.id},data:{status}});
  assert.equal((await edits.edit(order.id,f.user,'terminal',{credits:5})).status,409);
 }
 const order=await create(f,'edit-validation');
 assert.equal((await edits.edit(order.id,'outsider','owner',{credits:6})).status,403);
 const short=editOrderSchema.parse({expiryTime:new Date(Date.now()+1800000).toISOString()});assert.equal((await edits.edit(order.id,f.user,'short',short)).status,400);
 f.invalidSupplier=true;assert.equal((await edits.edit(order.id,f.user,'supplier',{supplierId:'2'})).status,409);f.invalidSupplier=false;
 f.unavailable=true;assert.equal((await edits.edit(order.id,f.user,'unavailable',{credits:6})).status,503);f.unavailable=false;
 assert.equal(f.updates,0);assert.equal(await db.orderEditOperation.count({where:{orderId:order.id}}),0);
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).credits,4);
});


test('shared Credit default retries recover transport faults before Order needs durable recovery',async t=>{
 const f=fixture(),wire=await grpcCreditFixture(t,f);
 const creation=createOrderCreation(db,wire.client,f.directories,wire.options);
 f.reserveMode='before';const created=await creation.submit(f.user,'shared-retry-create',f.input());assert.equal(created.status,201);assert.equal(f.calls,2);
 const edits=createOrderEdits(db,wire.client,f.directories,wire.options);f.updateMode='after';
 const edited=await edits.edit(created.order.id,f.user,'shared-retry-edit',{credits:7});assert.equal(edited.status,200);assert.equal(f.ledger.get(created.order.id).version,2);
 const lifecycle=createOrderLifecycle(db,wire.client,[],wire.options);f.releaseMode='before';
 const cancelled=await lifecycle.cancel(created.order.id,f.user);assert.equal(cancelled.order.creditState,'REFUNDED');assert.equal(f.ledger.get(created.order.id).version,3);
});


// Missing-account tests use the real shared client and real gRPC trailers.
function delayCourierAccount(f) {
 const grpc=require('@grpc/grpc-js'),original=f.credit.settleCredits;let ready=false;
 f.credit.settleCredits=async input=>{
  if(!ready){const metadata=new grpc.Metadata();metadata.set('x-credit-error-reason','ACCOUNT_NOT_FOUND');throw Object.assign(new Error('Courier account not initialized'),{code:grpc.status.NOT_FOUND,metadata});}
  return original(input);
 };
 return ()=>{ready=true};
}
test('missing courier Credit account keeps settlement pending and succeeds after account initialization',async t=>{
 const f=fixture(),makeReady=delayCourierAccount(f),wire=await grpcCreditFixture(t,f),order=await pickedUp(f);
 const lifecycle=createOrderLifecycle(db,wire.client,[],wire.options);
 const pending=await lifecycle.deliver(order.id,order.courierId);assert.equal(pending.order.status,'DELIVERED');assert.equal(pending.order.creditState,'SETTLEMENT_PENDING');
 let work=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'SETTLE'}}});assert.equal(work.state,'PENDING');assert.equal(work.attempts,1);
 assert.equal(f.ledger.get(order.id).status,'RESERVED');assert.equal(f.settlements,0);
 makeReady();await due(order.id,'SETTLE');await lifecycle.settlementBatch();
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'SETTLED');assert.equal(f.settlements,1);
 work=await db.creditOperation.findUniqueOrThrow({where:{id:work.id}});assert.equal(work.state,'SUCCEEDED');assert.equal(work.attempts,2);
});
test('missing courier account stops after the existing five retries and retains manual reconciliation state',async t=>{
 const f=fixture();delayCourierAccount(f);const wire=await grpcCreditFixture(t,f),order=await pickedUp(f),lifecycle=createOrderLifecycle(db,wire.client,[],wire.options);
 await lifecycle.deliver(order.id,order.courierId);
 for(let attempt=0;attempt<5;attempt++){await due(order.id,'SETTLE');await lifecycle.settlementBatch();}
 const work=await db.creditOperation.findUniqueOrThrow({where:{orderId_type:{orderId:order.id,type:'SETTLE'}}});assert.equal(work.attempts,6);assert.equal(work.state,'PERMANENTLY_FAILED');assert.equal(work.lastError,'retry-exhausted');
 await lifecycle.settlementBatch();assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).creditState,'SETTLEMENT_PENDING');assert.equal(f.settlements,0);assert.equal(f.ledger.get(order.id).status,'RESERVED');
});

// AI-generated pickup coverage (Codex, 2026-10-23); human review pending; usage-log.md.
test('pickup HTTP enforces actor, input, state and expiry and changes no credit reservation',async t=>{
 const f=fixture(),order=await create(f,'pickup-http'),courier=f.user+'-courier';
 await db.order.update({where:{id:order.id},data:{status:'ASSIGNED',courierId:courier,acceptedAt:new Date()}});
 const before={...f.ledger.get(order.id)};
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const server=createApp(publicKey.export({type:'spki',format:'pem'}),f.lifecycle).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/orders/';
 const headers=(sub,roles=['USER'])=>({'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({roles},privateKey,{algorithm:'RS256',subject:sub,expiresIn:60})});
 const post=(id,h,body={})=>fetch(base+id+'/pickup',{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post(order.id,{})).status,401);
 assert.equal((await post(order.id,headers(courier,['ADMINISTRATOR']))).status,403);
 assert.equal((await post(order.id,headers(f.user))).status,403);
 assert.equal((await post(order.id,headers('outsider'))).status,403);
 assert.equal((await post('bad-id',headers(courier))).status,400);
 assert.equal((await post(order.id,headers(courier),{courierId:courier})).status,400);
 assert.equal((await post(randomUUID(),headers(courier))).status,404);
 const response=await post(order.id,headers(courier));assert.equal(response.status,200);
 const saved=(await response.json()).order;assert.equal(saved.status,'PICKED_UP');assert.equal(saved.courierId,courier);assert.ok(saved.pickedUpAt);assert.equal(saved.creditState,'RESERVED');
 assert.deepEqual(f.ledger.get(order.id),before);assert.equal(f.settlements,0);assert.equal(f.releases,0);
 assert.equal((await post(order.id,headers(courier))).status,409);
 const persisted=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(persisted.pickedUpAt.toISOString(),saved.pickedUpAt);
});

test('pickup rejects all other states and elapsed expiry without setting timestamp',async()=>{
 const f=fixture(),courier=f.user+'-courier';
 for(const state of ['UNASSIGNED','PICKED_UP','DELIVERED','CANCELLED']){
  const order=await create(f,'pickup-'+state);await db.order.update({where:{id:order.id},data:{status:state,courierId:courier}});
  assert.equal((await f.lifecycle.pickup(order.id,courier)).status,409);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).pickedUpAt,null);
 }
 const order=await create(f,'pickup-expired');await db.order.update({where:{id:order.id},data:{status:'ASSIGNED',courierId:courier,expiryTime:new Date(0)}});
 assert.equal((await f.lifecycle.pickup(order.id,courier)).status,409);
 assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).pickedUpAt,null);
});

test('concurrent pickups yield one transition and use saved Supplier snapshot even if supplier closes',async()=>{
 const f=fixture(),order=await create(f,'pickup-race'),courier=f.user+'-courier';
 await db.order.update({where:{id:order.id},data:{status:'ASSIGNED',courierId:courier,acceptedAt:new Date()}});
 f.closed=true;
 const results=await Promise.all(Array.from({length:8},()=>f.lifecycle.pickup(order.id,courier)));
 assert.equal(results.filter(r=>r.order).length,1);assert.equal(results.filter(r=>r.status===409).length,7);
 const saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.status,'PICKED_UP');assert.equal(saved.pickupStore,order.pickupStore);assert.equal(saved.pickupLocation,order.pickupLocation);
 const delivered=await f.lifecycle.deliver(order.id,courier);assert.equal(delivered.order.status,'DELIVERED');assert.equal(delivered.order.creditState,'SETTLED');assert.equal(f.settlements,1);
});
