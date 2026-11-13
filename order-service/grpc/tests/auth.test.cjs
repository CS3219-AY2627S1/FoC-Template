// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Generated JWT/role HTTP tests; author review pending; see ../../usage-log.md.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');const {once}=require('node:events');
const express=require('express');const jwt=require('jsonwebtoken');
const {createAuthenticate,requireUser}=require('../dist/auth/authenticate');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key=publicKey.export({type:'spki',format:'pem'});
test('JWT authentication rejects forgery, expiry and missing claims; roles enforce USER',async t=>{
 const app=express();app.get('/',createAuthenticate(key),requireUser,(_req,res)=>res.json(res.locals.user));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url='http://127.0.0.1:'+server.address().port;
 const sign=(payload,opts={})=>jwt.sign(payload,privateKey,{algorithm:'RS256',...opts});
 const good=sign({sub:'user-1',roles:['USER']},{expiresIn:60});
 let r=await fetch(url,{headers:{Authorization:'Bearer '+good}});assert.equal(r.status,200);assert.equal((await r.json()).id,'user-1');
 const admin=sign({sub:'admin',roles:['ADMINISTRATOR']},{expiresIn:60});
 assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+admin}})).status,403);
 for(const token of [undefined,'garbage',sign({sub:'u',roles:['USER']}),sign({sub:' ',roles:['USER']},{expiresIn:60}),sign({sub:'u',roles:[]},{expiresIn:60}),sign({sub:'u',roles:['UNKNOWN']},{expiresIn:60}),sign({sub:'u',roles:['USER']},{expiresIn:-1}),jwt.sign({sub:'u',roles:['USER']},'forged',{algorithm:'HS256',expiresIn:60})]) {
  const r=await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{}});assert.equal(r.status,401);
 }
});
