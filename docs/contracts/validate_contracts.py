"""Offline schema/fixture verification; needs jsonschema and openapi-spec-validator."""
import copy
import json
import re
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate_spec

root=Path(__file__).resolve().parent
def read(name): return json.loads((root/name).read_text(encoding='utf-8'))
api=read('n2h.openapi.json')
validate_spec(api)
event_schema=read('n2h-events.schema.json')
ws=read('chat-websocket.schema.json')
Draft202012Validator.check_schema(event_schema)
Draft202012Validator.check_schema(ws)
validator=Draft202012Validator(event_schema,format_checker=FormatChecker())
repo=root.parents[1]
action_java=(repo/'order-service/src/main/java/com/friendoncampus/order/domain/OrderAction.java').read_text(encoding='utf-8')
action_java=re.sub(r'/\*.*?\*/|//[^\n]*','',action_java,flags=re.S)
java_actions=set(re.findall(r'\b[A-Z][A-Z_]+\b',action_java.split('{',1)[1]))
lifecycle=next(x for x in event_schema['oneOf'] if x['title']=='OrderTransitioned')
assert set(lifecycle['properties']['data']['properties']['action']['enum'])==java_actions,'OrderAction/schema drift'
examples=read('events.examples.json')
for example in examples:
    event=example['event']; validator.validate(event)
    branch=next(x for x in event_schema['oneOf'] if x['title']==event['eventType'])
    assert branch['x-topic']==example['topic']
    assert event['aggregateId']==example['key']
    if 'targetUserId' in event['data']: assert event['aggregateId']==event['data']['targetUserId']
    if 'requestedBy' in event['data']: assert event['actor']['userId']==event['data']['requestedBy']
    if 'reviewerId' in event['data']: assert event['actor']['userId']==event['data']['reviewerId']
    if event['eventType']=='OrderTransitioned':
        assert event['aggregateId']==event['data']['orderId']
        assert event['data']['snapshot']['status']==event['data']['toState']
    if event['aggregateType']=='AdminCase': assert event['aggregateId']==event['data']['caseId']
    bad=copy.deepcopy(event); bad['eventVersion']=99
    assert not validator.is_valid(bad),'Unknown version accepted'
    bad=copy.deepcopy(event); del bad['data']
    assert not validator.is_valid(bad),'Missing payload accepted'

ops={op['operationId']:op for item in api['paths'].values() for op in item.values()}
def validate_http(body,schema):
    doc={'components':api['components'],**schema}
    Draft202012Validator(doc,format_checker=FormatChecker()).validate(body)
def is_valid_http(body,schema):
    doc={'components':api['components'],**schema}
    return Draft202012Validator(doc,format_checker=FormatChecker()).is_valid(body)
for example in read('http.examples.json'):
    op=ops[example['operationId']]
    validate_http(example['body'],op['responses'][str(example['status'])]['content']['application/json']['schema'])
    if 'requestBody' in op: validate_http(example['requestBody'],op['requestBody']['content']['application/json']['schema'])
    assert op['security']
    for p in op['parameters']:
        if p['in']=='path': assert p['required'] is True

chat_schema=api['components']['schemas']['EvidenceData']
chat_data={'kind':'CHAT','caseId':'10000000-0000-4000-8000-000000000001','conversationId':'10000000-0000-4000-8000-000000000002','conversationType':'ERRAND','participantUserId':None,'messageId':'10000000-0000-4000-8000-000000000003','messageType':'TEXT','text':'Original message, unchanged.','attachment':None}
validate_http(chat_data,chat_schema)
bad_chat=copy.deepcopy(chat_data);bad_chat['messageType']='IMAGE'
assert not is_valid_http(bad_chat,chat_schema),'Image evidence accepted without protected attachment metadata'
bad_chat=copy.deepcopy(chat_data);bad_chat['attachment']={'id':chat_data['messageId'],'contentType':'image/png','filename':'test.png','size':1}
assert not is_valid_http(bad_chat,chat_schema),'Text evidence accepted with attachment'
bad_chat=copy.deepcopy(chat_data);bad_chat['text']='x'*4001
assert not is_valid_http(bad_chat,chat_schema),'Oversized original message accepted'
bad_chat=copy.deepcopy(chat_data);bad_chat['conversationType']='CASE'
assert not is_valid_http(bad_chat,chat_schema),'Private case message missing participant identity'

ws_validator=Draft202012Validator(ws,format_checker=FormatChecker())
for frame in read('websocket.examples.json'):
    ws_validator.validate(frame)
    bad=copy.deepcopy(frame); bad['type']='UNSUPPORTED_FRAME'
    assert not ws_validator.is_valid(bad)
message_schema={'components':api['components'],**api['components']['schemas']['Message']}
msg=next(x['message'] for x in read('websocket.examples.json') if x['type']=='MESSAGE_CREATED')
bad=copy.deepcopy(msg); bad['attachment']={'attachmentId':msg['id'],'mediaType':'image/png','sizeBytes':10}
assert not Draft202012Validator(message_schema).is_valid(bad),'Text and attachment both accepted'

preference_op=ops['chat_put__api_chat_preferences']
preference_schema=preference_op['requestBody']['content']['application/json']['schema']
bad_preference={'preferredLanguage':'xx'}
assert not is_valid_http(bad_preference,preference_schema),'Unsupported preferred language accepted'

message_request=ops['chat_post__api_chat_conversations_conversationId_messages']['requestBody']['content']['application/json']['schema']
valid_reply={'clientMessageId':'11111111-1111-4111-8111-111111111111','quickReplyKey':'ARRIVED'}
assert is_valid_http(valid_reply,message_request),'Valid quick-reply message rejected'
ambiguous={'clientMessageId':'11111111-1111-4111-8111-111111111111','text':'hello','quickReplyKey':'ARRIVED'}
assert not is_valid_http(ambiguous,message_request),'Ambiguous typed/quick-reply message accepted'
unknown_reply={'clientMessageId':'11111111-1111-4111-8111-111111111111','quickReplyKey':'CUSTOM_TEXT'}
assert not is_valid_http(unknown_reply,message_request),'Unknown quick-reply key accepted'

translation_request=ops['chat_post__api_chat_conversations_conversationId_messages_messageId_translations']['requestBody']['content']['application/json']['schema']
assert not is_valid_http({'targetLanguage':'xx'},translation_request),'Unsupported translation language accepted'

def check_refs(value,doc):
    if isinstance(value,dict):
        if '$ref' in value:
            parts=value['$ref'].split('/')
            assert parts[0]=='#','Unexpected external reference'
            node=doc
            for part in parts[1:]: node=node[part.replace('~1','/').replace('~0','~')]
        for child in value.values(): check_refs(child,doc)
    elif isinstance(value,list):
        for child in value: check_refs(child,doc)
for doc in [api,event_schema,ws]: check_refs(doc,doc)

zero=copy.deepcopy(examples[0]['event']); zero['data']['amount']=0
assert not validator.is_valid(zero),'Zero correction accepted'
fraction=copy.deepcopy(examples[0]['event']); fraction['data']['amount']=1.5
assert not validator.is_valid(fraction),'Fractional correction accepted'
print(f'PASS: OpenAPI; {len(ops)} HTTP operations/request-response fixtures; {len(examples)} event fixtures; negative event tests; WebSocket examples; local references; OrderAction alignment.')

dispute=read('dispute.schema.json')
Draft202012Validator.check_schema(dispute)
dispute_validator=Draft202012Validator(dispute,format_checker=FormatChecker())
for fixture in read('dispute.examples.json'):
    message=fixture['message'];dispute_validator.validate(message)
    branch=next(v for v in dispute['oneOf'] if v['title']==message['type'])
    assert branch['x-topic']==fixture['topic'] and fixture['key']==message['orderId']
    for mutate in ('version','credential','producer','actor'):
        bad=copy.deepcopy(message)
        if mutate=='version':bad['eventVersion']=99
        elif mutate=='credential':bad['data']['actorToken']='TEST ONLY FORBIDDEN CREDENTIAL'
        elif mutate=='producer':bad['producer']='unknown-service'
        else:bad['actorId']='not-a-uuid'
        assert not dispute_validator.is_valid(bad),f'Invalid dispute {mutate} accepted'
for path in ['/internal/orders/{orderId}/review','/internal/orders/{orderId}/dispute-resolution','/internal/credits/orders/{orderId}/dispute-resolution','/internal/chat/orders/{orderId}/review','/internal/chat/cases/{caseId}/closure']:
    assert path not in api['paths'],'Obsolete synchronous dispute write retained'
assert '202' in api['paths']['/api/admin/reports']['post']['responses']
assert '202' in api['paths']['/api/admin/cases/{caseId}/resolve']['post']['responses']
print('PASS: dispute owner/topic schemas, no credentials, identity/version negatives, pending responses and removed HTTP writes.')
