"""Create a disposable user and verify trace headers/identity attributes. Never prints tokens."""
import base64,json,secrets,sys,time,urllib.request,urllib.error
base=sys.argv[1].rstrip('/')
grafana=sys.argv[2].rstrip('/') if len(sys.argv)>2 else 'http://localhost:3000'
def call(path,data=None,token=None,trace_id=None):
    h={'Content-Type':'application/json'}
    if token:h['Authorization']='Bearer '+token
    if trace_id:h['traceparent']='00-'+trace_id+'-0123456789abcdef-01'
    q=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=h)
    with urllib.request.urlopen(q,timeout=30) as r:
        raw=r.read()
        try:body=json.loads(raw) if raw else None
        except json.JSONDecodeError:body=raw.decode()
        return r.status,body,r.headers.get('X-Trace-Id')
creds={'email':'trace-check-'+secrets.token_hex(5)+'@example.com','password':'Test!9'+secrets.token_hex(16)}
call('/api/public/user/auth/register',creds)
_,tokens,_=call('/api/public/user/auth/login',creds)
token=tokens['accessToken'];payload=token.split('.')[1];uid=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))['sub']
for name,path in [('user','/api/public/user/user/'+str(uid)),('supplier','/api/public/supplier/suppliers/'),('order','/api/public/order/orders/?scope=requested'),('credit','/api/public/credit/credits/'+str(uid)+'/balance')]:
    trace_id=secrets.token_hex(16)
    for retry in range(15):
        try:status,body,header=call(path,token=token,trace_id=trace_id);break
        except urllib.error.HTTPError as ex:
            if name!='credit' or retry==14:raise
            time.sleep(2)
    assert header==trace_id,(name,'trace header mismatch',header)
    print('PASS',name,'X-Trace-Id',trace_id,flush=True)
    for retry in range(30):
        try:
            with urllib.request.urlopen(grafana+'/api/datasources/proxy/uid/campusgo-tempo/api/traces/'+trace_id,timeout=15) as r:trace=json.load(r)
            attrs=[]
            def walk(x):
                if isinstance(x,dict):
                    if x.get('key')=='user.id':attrs.append(x.get('value',{}).get('stringValue'))
                    for v in x.values():walk(v)
                elif isinstance(x,list):
                    for v in x:walk(v)
            walk(trace)
            if str(uid) in attrs:break
        except (urllib.error.HTTPError,urllib.error.URLError):pass
        time.sleep(2)
    else:raise AssertionError((name,'trace/user.id not found in Tempo'))
    print('PASS',name,'Tempo user.id',uid,flush=True)
