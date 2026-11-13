/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Disposable gateway security integration test. Run from repo root. */
const cp=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const docker=process.env.DOCKER_EXE||'docker',name='report-saga-gateway-'+Date.now();
let created=false;fs.mkdirSync('reporting-service/target',{recursive:true});const log=fs.openSync('reporting-service/target/gateway-build.log','w');
const d=(args,stdio)=>{const r=cp.spawnSync(docker,args,{windowsHide:true,encoding:'utf8',stdio});if(r.status!==0)throw Error(r.stderr||r.stdout||'Docker failed');return r.stdout?.trim();};
(async()=>{try {
 d(['build','-t','foc-gateway:report-saga-check','gateway'],['ignore',log,log]);
 const env=['FRONTEND_URL','USER_SERVICE_URL','SUPPLIER_SERVICE_URL','ORDER_SERVICE_URL','CREDIT_SERVICE_URL','REPORTING_SERVICE_URL','ADMIN_SERVICE_URL'].flatMap(k=>['-e',k+'=http://127.0.0.1:1']);
 d(['run','-d','--name',name,'-p','127.0.0.1::8080',...env,'foc-gateway:report-saga-check']);created=true;
 const port=d(['port',name,'8080/tcp']).split(':').at(-1),url='http://127.0.0.1:'+port;
 for(let i=0;i<30;i++){try{if((await fetch(url+'/gateway/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 for(const p of ['/api/reports/internal/order-resolutions/key','/api/reports/internal/order-resolution-compensations','/api/reports/internal;test/order-resolutions/key','/api/reports/internal%2Forder-resolutions/key'])
  for(const method of ['PUT','POST'])assert.equal((await fetch(url+p,{method,headers:{Authorization:'Bearer synthetic-test'}})).status,404,p);
 assert.equal((await fetch(url+'/api/reports')).status,502);console.log('Gateway build/health, 8 internal route checks and public Report proxy path PASS');
}finally{if(created)d(['rm','-f',name]);fs.closeSync(log);}})().catch(e=>{console.error(e);process.exitCode=1;});
