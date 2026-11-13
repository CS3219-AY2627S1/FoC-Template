/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Isolated live Report/Order/PubSub verification. */
// Requires Node 22+, Java 21, Docker, and packaged Report and contract-capable Order jars.
// Creates only disposable containers/databases; never reads application credentials or .env.
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), target=path.join(root,'reporting-service/target');
const docker=process.env.DOCKER_EXE||'docker', java=process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME,'bin/java') : 'java';
const orderJar=process.env.ORDER_INTEGRATION_JAR, reportJar=path.join(target,'reporting-service-0.0.1-SNAPSHOT.jar');
if(!orderJar||!fs.existsSync(orderJar)||!fs.existsSync(reportJar))throw Error('Package Report and set ORDER_INTEGRATION_JAR to a contract-capable packaged Order jar.');
const suffix=Date.now().toString(36),project='demo-foc-report-saga',names=[],children=[],evidence=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const d=args=>{const r=cp.spawnSync(docker,args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
function container(kind,image,args,port){const name='report-saga-'+suffix+'-'+kind;d(['run','-d','--name',name,'-p','127.0.0.1::'+port,...args,image,...(kind==='pg'?[]:kind==='fs'?['gcloud','beta','emulators','firestore','start','--host-port=0.0.0.0:8080','--project='+project,'--quiet']:['gcloud','beta','emulators','pubsub','start','--host-port=0.0.0.0:8085','--project='+project,'--quiet'])]);names.push(name);return {name,port:d(['port',name,port+'/tcp']).split(':').at(-1)};}
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
async function until(check,label){for(let i=0;i<120;i++){try{const v=await check();if(v)return v;}catch{}await wait(500);}throw Error('Timed out: '+label);}
function startJar(label,jar,env){const fd=fs.openSync(path.join(target,'live-'+label+'.log'),'w');const child=cp.spawn(java,['-XX:ActiveProcessorCount=2','-Xmx512m','-jar',jar],{cwd:root,env:{...process.env,...env},stdio:['ignore',fd,fd],windowsHide:true});children.push(child);fs.closeSync(fd);child.on('error',e=>console.error(label,e.message));}
function token(id,email=id+'@u.nus.edu'){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);return encode({alg:'none',typ:'JWT'})+'.'+encode({sub:id,user_id:id,email,iat:now,exp:now+3600,iss:'https://securetoken.google.com/'+project,aud:project})+'.';}
async function call(base,url,who,body,method=body===undefined?'GET':'POST',expected=200){const headers={Authorization:'Bearer '+token(who)};let data;if(body instanceof FormData)data=body;else if(body!==undefined){headers['Content-Type']='application/json';data=JSON.stringify(body);}const response=await fetch(base+url,{method,headers,body:data,signal:AbortSignal.timeout(30000)});const text=await response.text();assert.equal(response.status,expected,method+' '+url+': '+text);return text?JSON.parse(text):null;}
async function broker(base,url,body,method='PUT'){const r=await fetch(base+'/v1/projects/'+project+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const t=await r.text();if(!r.ok)throw Error('Broker '+r.status+': '+t);return t?JSON.parse(t):{};}
let pg,proxy,dropReplyFor='',delayOriginalFor='';
function sql(text){return d(['exec',pg.name,'psql','-U','test','-d','order_test','-At','-v','ON_ERROR_STOP=1','-c',text]);}
(async()=>{const keepAlive=setInterval(()=>{},1000);let failure;
try {
 const image='gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators';
 pg=container('pg','postgres:15-alpine',['-e','POSTGRES_DB=order_test','-e','POSTGRES_USER=test','-e','POSTGRES_PASSWORD=fixture-only'],5432);
 const firestore=container('fs',image,[],8080),pubsub=container('pubsub',image,[],8085);
 const orderPort=await freePort(),reportPort=await freePort();const order='http://127.0.0.1:'+orderPort,report='http://127.0.0.1:'+reportPort;
 console.log('Disposable containers started; application ports allocated.');
 proxy=http.createServer(async(req,res)=>{
   try {
     const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
     const command=JSON.parse(body.toString());
     if(command.commandId===delayOriginalFor)await wait(5000);
     const response=await fetch(report+req.url,{method:req.method,headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body});
     const result=await response.text();
     if(command.commandId===dropReplyFor)res.destroy();
     else if(!res.destroyed){res.writeHead(response.status,{'Content-Type':'application/json'});res.end(result);}
   }catch{if(!res.destroyed){res.writeHead(502);res.end();}}
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const reportGateway='http://127.0.0.1:'+proxy.address().port;
 console.log('HTTP fault proxy listening.');
 const brokerUrl='http://127.0.0.1:'+pubsub.port;
 await until(()=>{try{return sql('select 1')==='1';}catch{return false;}},'PostgreSQL');
 console.log('PostgreSQL ready.');
 await until(async()=>{const r=await fetch(brokerUrl+'/v1/projects/'+project+'/topics',{signal:AbortSignal.timeout(2000)});return r.status===200;},'Pub/Sub');
 console.log('Pub/Sub ready.');
 const requestTopic='report-resolution-compensation-local-v1',resultTopic='report-resolution-compensation-result-local-v1';
 const creationRequestTopic='report-creation-compensation-local-v1',creationResultTopic='report-creation-compensation-result-local-v1';
 const requestSub='report-resolution-request-local',resultSub='order-resolution-result-local';
 const creationRequestSub='order-report-creation-compensation-local',creationResultSub='report-creation-compensation-result-local';
 for(const name of [requestTopic,resultTopic,creationRequestTopic,creationResultTopic,'order-completion-dev-v1','open-order-refund-dev-v1','courier-penalty-addition-dev-v1','courier-penalty-deduction-dev-v1'])await broker(brokerUrl,'/topics/'+name,{});
 await broker(brokerUrl,'/subscriptions/'+requestSub,{topic:'projects/'+project+'/topics/'+requestTopic,pushConfig:{pushEndpoint:'http://host.docker.internal:'+reportPort+'/api/reports/internal/order-resolution-compensations'},ackDeadlineSeconds:30});
 await broker(brokerUrl,'/subscriptions/'+resultSub,{topic:'projects/'+project+'/topics/'+resultTopic,pushConfig:{pushEndpoint:'http://host.docker.internal:'+orderPort+'/api/orders/internal/report-resolution-compensations'},ackDeadlineSeconds:30});
 await broker(brokerUrl,'/subscriptions/'+creationRequestSub,{topic:'projects/'+project+'/topics/'+creationRequestTopic,pushConfig:{pushEndpoint:'http://host.docker.internal:'+orderPort+'/api/orders/internal/report-creation-compensations'},ackDeadlineSeconds:30});
 await broker(brokerUrl,'/subscriptions/'+creationResultSub,{topic:'projects/'+project+'/topics/'+creationResultTopic,pushConfig:{pushEndpoint:'http://host.docker.internal:'+reportPort+'/api/reports/internal/creation-compensation-results'},ackDeadlineSeconds:30});
 const common={FOC_ENVIRONMENT:'local',FIREBASE_AUTH_PROJECT_ID:project,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',USER_SERVICE_MODE:'mock',MOCK_ADMIN_EMAILS:'admin@u.nus.edu',PUBSUB_EMULATOR_HOST:'127.0.0.1:'+pubsub.port,LOG_LEVEL:'INFO'};
 startJar('report',reportJar,{...common,PORT:String(reportPort),FIRESTORE_PROJECT_ID:project,FIRESTORE_DATABASE_ID:'reporting-saga-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:'+firestore.port,STORAGE_EMULATOR_HOST:'http://127.0.0.1:9',ORDER_SERVICE_URL:order,ORDER_SERVICE_TIMEOUT:'20s',REPORT_RESOLUTION_ENABLED:'true',REPORT_PUBSUB_PROJECT_ID:project,REPORT_RESOLUTION_RESULT_TOPIC:resultTopic,REPORT_RESOLUTION_COMPENSATION_SUBSCRIPTION:'projects/'+project+'/subscriptions/'+requestSub,REPORT_RESOLUTION_PUSH_MODE:'emulator',REPORT_RESULT_RECOVERY_CRON:'-',REPORT_CREATION_ENABLED:'true',REPORT_CREATION_COMPENSATION_TOPIC:creationRequestTopic,REPORT_CREATION_COMPENSATION_RESULT_SUBSCRIPTION:'projects/'+project+'/subscriptions/'+creationResultSub,REPORT_CREATION_RESULT_PUSH_MODE:'emulator',REPORT_CREATION_RECOVERY_CRON:'-'});
 startJar('order',orderJar,{...common,PORT:String(orderPort),SPRING_PROFILES_ACTIVE:'prod',SPRING_DATASOURCE_URL:'jdbc:postgresql://127.0.0.1:'+pg.port+'/order_test',SPRING_DATASOURCE_USERNAME:'test',SPRING_DATASOURCE_PASSWORD:'fixture-only',SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE:'3',ORDER_PEERS_MODE:'mock',ORDER_USER_SERVICE_MODE:'mock',ORDER_LIFECYCLE_CRON:'-',ORDER_OUTBOX_RECOVERY_CRON:'*/1 * * * * *',ORDER_MESSAGING_MODE:'emulator',PUBSUB_PROJECT_ID:project,ORDER_REPORT_RESOLUTION_ENABLED:'true',ORDER_REPORT_RESOLUTION_TIMEOUT:'3s',REPORT_SERVICE_URL:reportGateway,ORDER_REPORT_COMPENSATION_TOPIC:requestTopic,REPORT_COMPENSATION_RESULT_TOPIC:resultTopic,ORDER_REPORT_COMPENSATION_RESULT_SUBSCRIPTION:resultSub,ORDER_REPORT_COMPENSATION_PUSH_MODE:'emulator',ORDER_REPORT_CREATION_ENABLED:'true',REPORT_CREATION_COMPENSATION_RESULT_TOPIC:creationResultTopic,ORDER_REPORT_CREATION_COMPENSATION_SUBSCRIPTION:'projects/'+project+'/subscriptions/'+creationRequestSub,ORDER_REPORT_CREATION_PUSH_MODE:'emulator'});
 for(const [name,origin] of [['Order',order],['Report',report]])await until(async()=>{const r=await fetch(origin+'/actuator/health');return r.status===200;},name+' health');
 // Exercise the browser's Nginx boundary as well as the service-to-service calls.
 d(['build','-q','-t','foc-gateway:report-resolution-check',path.join(root,'gateway')]);
 const gatewayName='report-saga-'+suffix+'-gateway';
 d(['run','-d','--name',gatewayName,'-p','127.0.0.1::8080',
   '-e','REPORTING_SERVICE_URL=http://host.docker.internal:'+reportPort,
   '-e','ORDER_SERVICE_URL=http://host.docker.internal:'+orderPort,'foc-gateway:report-resolution-check']);
 names.push(gatewayName);
 const browserGateway='http://127.0.0.1:'+d(['port',gatewayName,'8080/tcp']).split(':').at(-1);
 await until(async()=>{const r=await fetch(browserGateway+'/gateway/health');return r.status===200;},'browser gateway health');
 async function create(){const expiry=new Date(Date.now()+4*3600000);expiry.setUTCMinutes(Math.ceil(expiry.getUTCMinutes()/15)*15,0,0);return call(order,'/api/orders','requester',{commandId:crypto.randomUUID(),requesterId:'requester',itemDescription:'Saga integration parcel',pickupSupplierId:'pickup',deliverySupplierId:'delivery',offeredCredits:1,deliveryTimeLimitMinutes:60,expiresAt:expiry.toISOString(),automaticRepost:false,repostDueAt:null,repostCreditAmount:0,repostDeliveryDurationMinutes:0,repostExpiresAt:null});}
 async function action(o,step,who,expected=200){return call(order,'/api/orders/'+o.id+'/'+step,who,{commandId:crypto.randomUUID(),actorId:who,expectedVersion:o.version},'POST',expected);}
 async function createReport(who,input,expected=201){
   const submissionId=crypto.randomUUID(),form=new FormData();
   form.append('report',new Blob([JSON.stringify({...input,submissionId})],{type:'application/json'}));
   const response=await call(report,'/api/reports',who,form,'POST',expected);
   if(!response?.report)return response;
   assert.equal(response.submissionId,submissionId);assert.equal(response.state,'COMPLETED');assert.equal(response.reportId,response.report.id);
   return {...response.report,submissionId};
 }
 async function submit(o,expected=201){return createReport('requester',{category:'ORDER',description:'Parcel damaged',orderId:o.id},expected);}
 const open=await create();
 assert(!(await call(order,'/api/orders/mine/active?page=1&size=100','requester')).items.some(x=>x.id===open.id));
 await call(order,'/api/orders/mine/active/'+open.id+'/report-holds/'+crypto.randomUUID(),'requester',{requireAssignedCourier:false,submissionId:crypto.randomUUID()},'PUT',404);
 await createReport('requester',{category:'ORDER',description:'Not accepted yet',orderId:open.id},404);
 assert.equal(sql("select count(*) from order_completion_holds where order_id='"+open.id+"'"),'0');
 evidence.push('OPEN excluded from SQL report selector; atomic hold and Report submission reject OPEN without leaving a hold PASS');
 let o=await action(await create(),'accept','courier'),r=await submit(o);
 assert.equal(r.status,'AWAITING_COURIER_RESPONSE');
 assert.equal((await call(report,'/api/reports/mine/response-count','courier')).count,1);
 assert.equal((await call(report,'/api/reports/mine/response-count','other')).count,0);
 const duplicate=await submit(o,409);assert.equal(duplicate.message,'This order has an active report. Please resolve it before proceeding.');
 await submitCourierOrder(o,'courier',409);
 const heldAbortKey=crypto.randomUUID();
 const heldAbort=await call(order,'/api/orders/commands/'+o.id+'/abort','courier',{commandId:heldAbortKey,actorId:'courier',expectedVersion:o.version});
 assert.equal(heldAbort.outcome,'REJECTED');assert.equal(heldAbort.reason,'ORDER_ON_HOLD');
 assert.equal(heldAbort.message,'This order has an active report. Please resolve it before proceeding.');
 assert.equal(sql("select possible_effect from order_commands where command_id='"+heldAbortKey+"'"),'f');
 const mine=await call(order,'/api/orders/mine/active?page=1&size=100','requester');assert(mine.items.some(x=>x.id===o.id));
 assert.equal((await call(order,'/api/orders/mine/active?page=1&size=100','other')).totalItems,0);
 const hold=await call(order,'/api/orders/mine/active/'+o.id+'/report-holds/'+r.id,'requester',{requireAssignedCourier:true,submissionId:r.submissionId},'PUT');assert.equal(hold.isCompletionHold,true);
 for(const step of ['start','pickup','deliver'])o=await action({...o,version:Number(sql("select version from orders where id='"+o.id+"'"))},step,'courier');
 const retry=await call(order,'/api/orders/mine/active/'+o.id+'/report-holds/'+r.id,'requester',{requireAssignedCourier:true,submissionId:r.submissionId},'PUT');assert.equal(retry.status,'DELIVERED');
 await action(o,'complete','requester',409);
 await call(report,'/api/reports/'+r.id+'/status','admin',{status:'RESOLVED'},'PATCH',409);
 const key=crypto.randomUUID(),body={commandId:key,reply:'Evidence reviewed; continue with completion.'};
 const resolved=await call(browserGateway,'/api/reports/'+r.id+'/resolve','admin',body);assert.equal(resolved.status,'SUCCEEDED');
 const replay=await call(browserGateway,'/api/reports/'+r.id+'/resolve','admin',body);assert.deepEqual(replay,resolved);
 evidence.push('Actual Nginx browser route returns 200 and intact SUCCEEDED JSON for resolution and exact replay PASS');
 const privateView=await call(report,'/api/reports/'+r.id,'requester');assert.equal(privateView.resolutionNote,body.reply);
 assert.equal((await call(report,'/api/reports/'+r.id,'courier')).resolutionNote,null);
 o=await call(order,'/api/orders/'+o.id,'requester');assert.equal(o.isCompletionHold,false);
 o=await action(o,'complete','requester');assert.equal(o.status,'COMPLETED');
 evidence.push('Actual active-order selection, atomic hold/retry current snapshot, delivery while held, blocked completion, coordinated resolution/replay and private reply PASS');

 assert.equal((await call(report,'/api/reports/mine/response-count','courier')).count,0);
 for(const who of ['requester','courier'])assert((await call(order,'/api/orders/mine/completed?page=1&size=20',who)).items.some(x=>x.id===o.id));
 assert(!(await call(order,'/api/orders/mine/completed?page=1&size=20','other')).items.some(x=>x.id===o.id));
 assert((await call(order,'/api/orders/mine/completed/'+o.id,'courier')).startedAt);
 await call(order,'/api/orders/mine/completed/'+o.id,'other',undefined,'GET',404);
 await call(order,'/api/orders/mine/completed/'+open.id,'requester',undefined,'GET',404);
 async function credit(who,id,expected=201){return createReport(who,{category:'CREDITS',description:'Missing delivery credit',orderId:id},expected);}

 await credit('courier',o.id,400);
 await credit('courier',null,400);
 const generalReport=await createReport('courier',{category:'GENERAL',description:'General issue'},201);assert.equal(generalReport.status,'READY_FOR_REVIEW');assert.equal(generalReport.courierId,null);assert.equal(generalReport.orderId,null);
 const generalResolved=await call(report,'/api/reports/'+generalReport.id+'/resolve','admin',{commandId:crypto.randomUUID(),reply:'General issue reviewed.'});assert.equal(generalResolved.status,'RESOLVED');
 const cancelled=await action(await create(),'cancel','requester');assert.equal(cancelled.status,'CANCELLED');
 assert((await call(order,'/api/orders/mine/cancelled?page=1&size=20','requester')).items.some(x=>x.id===cancelled.id));
 assert.equal((await call(order,'/api/orders/mine/cancelled/'+cancelled.id,'requester')).status,'CANCELLED');
 await call(order,'/api/orders/mine/cancelled/'+cancelled.id,'other',undefined,'GET',404);
 await call(order,'/api/orders/mine/cancelled/'+o.id,'requester',undefined,'GET',404);
 await call(order,'/api/orders/mine/completed/'+cancelled.id,'requester',undefined,'GET',404);
 assert.equal(sql("select completion_hold from orders where id='"+o.id+"'"),'f');
 assert.equal((await call(report,'/api/reports/mine/response-count','courier')).count,0);
 evidence.push('Completed/cancelled caller-scoped SQL history, unlinked general submission/resolution, retired-credit rejection and courier reminder count PASS');
 async function submitCourierOrder(orderValue,who='courier',expected=201){return createReport(who,{category:'ERRAND',description:'Nothing at pickup',orderId:orderValue.id},expected);}
 const assigned=await action(await create(),'accept','courier');
 for(const who of ['requester','courier'])assert((await call(order,'/api/orders/mine/active?mode=participant&page=1&size=100',who)).items.some(x=>x.id===assigned.id));
 assert(!(await call(order,'/api/orders/mine/active?mode=participant&page=1&size=100','other')).items.some(x=>x.id===assigned.id));
 await submitCourierOrder(assigned,'other',404);
 await submitCourierOrder(assigned,'requester',404);
 await createReport('courier',{category:'ORDER',description:'Wrong category',orderId:assigned.id},404);
 await createReport('courier',{category:'COURIER',description:'Old category',orderId:assigned.id},400);
 assert.equal(sql("select count(*) from order_completion_holds where order_id='"+assigned.id+"'"),'0');
 const errand=await submitCourierOrder(assigned);assert.equal(errand.requesterId,'requester');assert.equal(errand.reporterId,'courier');
 assert.equal(errand.category,'ERRAND');assert.equal(errand.respondentId,'requester');assert.equal(errand.status,'AWAITING_COURIER_RESPONSE');
 assert.equal(Date.parse(errand.responseDeadlineAt)-Date.parse(errand.createdAt),86400000);
 assert((await call(report,'/api/reports/mine?view=submitted&page=1&size=20','courier')).items.some(x=>x.id===errand.id));
 assert(!(await call(report,'/api/reports/mine?view=against-me&page=1&size=20','courier')).items.some(x=>x.id===errand.id));
 assert((await call(report,'/api/reports/mine?view=against-me&page=1&size=20','requester')).items.some(x=>x.id===errand.id));
 assert.equal((await call(report,'/api/reports/mine/response-count','requester')).count,1);
 assert.equal((await call(report,'/api/reports/mine/response-count','courier')).count,0);
 await submit(assigned,409);
 async function reply(who,expected=200){const form=new FormData();form.append('response',new Blob([JSON.stringify({explanation:'Supplier moved it to the counter'})],{type:'application/json'}));return call(report,'/api/reports/'+errand.id+'/response',who,form,'POST',expected);}
 await reply('courier',403);await reply('other',403);
 const response=await reply('requester');assert.equal(response.status,'READY_FOR_REVIEW');assert.equal(response.responseExplanation,'Supplier moved it to the counter');
 await reply('requester',409);
 assert.equal((await call(report,'/api/reports/mine/response-count','requester')).count,0);
 const errandResolution={commandId:crypto.randomUUID(),reply:'Both sides reviewed.'};
 assert.equal((await call(browserGateway,'/api/reports/'+errand.id+'/resolve','admin',errandResolution)).status,'SUCCEEDED');
 assert.equal((await call(report,'/api/reports/'+errand.id,'courier')).resolutionNote,errandResolution.reply);
 assert.equal((await call(report,'/api/reports/'+errand.id,'requester')).resolutionNote,null);
 assert.equal(sql("select completion_hold from orders where id='"+assigned.id+"'"),'f');
 evidence.push('Separate ORDER/ERRAND: role-scoped ownership, cross-category duplicate block, requester incoming report and badge,24h response, no self/stranger response, duplicate rejection, actual participant saga binding/private reply PASS');
 // Fail only final Order hold release AFTER Report commits. No service mock handles resolution/compensation.
 let bad=await action(await create(),'accept','courier'),dispute=await submitCourierOrder(bad);
 const persistedDeadline=(await call(report,'/api/reports/'+dispute.id,'courier')).responseDeadlineAt;
 sql("CREATE FUNCTION fail_test_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='"+bad.id+"' AND OLD.completion_hold AND NOT NEW.completion_hold THEN RAISE EXCEPTION 'isolated test release failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_test_release BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_test_release();");
 const failedKey=crypto.randomUUID();await call(report,'/api/reports/'+dispute.id+'/resolve','admin',{commandId:failedKey,reply:'Test rollback recovery'},'POST',202);
 await until(()=>sql("select state from order_report_resolutions where command_id='"+failedKey+"'")==='COMPENSATED','two-way real Pub/Sub compensation');
 const restored=await call(report,'/api/reports/'+dispute.id,'courier');assert.equal(restored.status,'AWAITING_COURIER_RESPONSE');assert.equal(restored.resolutionNote,null);assert.equal(restored.requesterId,'requester');assert.equal(restored.responseDeadlineAt,persistedDeadline);
 assert.equal(sql("select completion_hold from orders where id='"+bad.id+"'"),'t');
 const compensationId=sql("select compensation_id from order_report_resolutions where command_id='"+failedKey+"'");
 const event={eventId:compensationId,commandId:failedKey,reportId:dispute.id,orderId:bad.id,requesterId:'requester',courierId:'courier',adminId:'admin',generation:2};
 await broker(brokerUrl,'/topics/'+requestTopic+':publish',{messages:[{data:Buffer.from(JSON.stringify(event)).toString('base64'),attributes:{eventId:compensationId,eventType:'ReportResolutionCompensationRequested',eventVersion:'1'}}]},'POST');
 await wait(1500);assert.equal(sql("select count(*) from order_report_resolution_results where command_id='"+failedKey+"'"),'1');
 assert.equal((await call(report,'/api/reports/'+dispute.id,'courier')).status,'AWAITING_COURIER_RESPONSE');
 evidence.push('Actual final Order rollback -> durable compensation outbox -> Pub/Sub push -> Report conditional restore/result outbox -> Pub/Sub result -> Order COMPENSATED, hold retained; duplicate delivery one inbox/result PASS');
 sql('DROP TRIGGER fail_test_release ON orders; DROP FUNCTION fail_test_release();');
 const recovered=await call(report,'/api/reports/'+dispute.id+'/resolve','admin',{commandId:crypto.randomUUID(),reply:'Retried after confirmed compensation'});assert.equal(recovered.status,'SUCCEEDED');
 evidence.push('Fresh command after confirmed compensation resolves and releases hold PASS');
 const lostOrder=await action(await create(),'accept','courier'),lostReport=await submit(lostOrder);
 dropReplyFor=crypto.randomUUID();
 await call(report,'/api/reports/'+lostReport.id+'/resolve','admin',{commandId:dropReplyFor,reply:'Lost response test'},'POST',202);
 await until(()=>sql("select state from order_report_resolutions where command_id='"+dropReplyFor+"'")==='COMPENSATED','lost Report HTTP response compensation');
 assert.equal((await call(report,'/api/reports/'+lostReport.id,'requester')).status,'AWAITING_COURIER_RESPONSE');
 assert.equal(sql("select completion_hold from orders where id='"+lostOrder.id+"'"),'t');
 evidence.push('Report committed but HTTP response lost: real broker reversal, retained hold PASS');
 const delayedOrder=await action(await create(),'accept','courier'),delayedReport=await submit(delayedOrder);
 delayOriginalFor=crypto.randomUUID();
 await call(report,'/api/reports/'+delayedReport.id+'/resolve','admin',{commandId:delayOriginalFor,reply:'Delayed original test'},'POST',202);
 await until(()=>sql("select state from order_report_resolutions where command_id='"+delayOriginalFor+"'")==='COMPENSATED','fence before delayed original');
 await wait(3000);
 assert.equal((await call(report,'/api/reports/'+delayedReport.id,'requester')).status,'AWAITING_COURIER_RESPONSE');
 assert.equal(sql("select reason from order_report_resolutions where command_id='"+delayOriginalFor+"'"),'FENCED_NO_EFFECT');
 evidence.push('Compensation delivered before delayed original HTTP mutation: tombstone fences late resolution PASS');
 console.log(evidence.join('\n'));
}catch(error){failure=error;console.error(error.stack);}
finally{
 for(const child of children)child.kill();
 if(proxy){proxy.closeAllConnections();proxy.close();}
 for(const name of names.reverse())try{d(['rm','-f',name]);}catch(e){console.error('Fixture cleanup failed',name,e.message);}
 clearInterval(keepAlive);fs.writeFileSync(path.join(target,'live-order-resolution-result.json'),JSON.stringify({passed:!failure,evidence,error:failure?.message},null,2));
 process.exitCode=failure?1:0;
}})();
