"""Generate reviewable draft N2H wire contracts using Python's standard library."""
import copy
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
UUID = {'type': 'string', 'format': 'uuid'}
TIME = {'type': 'string', 'format': 'date-time'}
TEXT = {'type': 'string', 'minLength': 1, 'maxLength': 2000}
INT = {'type': 'integer', 'minimum': 0}
def nullable(s): return {'anyOf': [s, {'type': 'null'}]}
def enum(*v): return {'type': 'string', 'enum': list(v)}
def array(s): return {'type': 'array', 'items': s}
def obj(properties, required=None):
    return {'type': 'object', 'properties': properties,
            'required': list(properties) if required is None else required, 'additionalProperties': False}
def ref(n): return {'$ref': '#/components/schemas/' + n}
def write(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')

LANGUAGE = enum('en', 'zh', 'ms', 'ta')
QUICK_REPLY_KEY = enum('ON_MY_WAY', 'ARRIVED', 'RUNNING_LATE_5', 'WHERE_MEET', 'THANK_YOU')

S = {}
S['Problem'] = obj({'type': {'type':'string'}, 'title': TEXT, 'status': {'type':'integer'},
                    'detail': TEXT, 'instance': {'type':'string'}, 'code': TEXT}, ['title','status'])
S['Checkpoint'] = obj({'source': TEXT, 'stream': TEXT, 'aggregateId': UUID,
    'committedSequence': INT, 'checkedAt': TIME})
S['ProjectionCheckpoint'] = obj({**S['Checkpoint']['properties'],'projectedSequence':INT})
S['Gap'] = obj({'source': TEXT, 'stream': TEXT, 'aggregateId': UUID,
    'fromSequence': INT, 'toSequence': INT, 'reason': enum('MISSING_SEQUENCE','BACKFILL_PENDING','SOURCE_UNAVAILABLE','FAILED_INGESTION')})
S['Coverage'] = obj({'status': enum('COMPLETE','INCOMPLETE','UNKNOWN'), 'asOf': TIME,
    'checkpoints': array(ref('ProjectionCheckpoint')), 'blockingGaps': array(ref('Gap'))})
S['Participant'] = obj({'userId': UUID, 'relationship': enum('REQUESTER','HISTORICAL_COURIER'),
    'assignedAt': nullable(TIME), 'unassignedAt': nullable(TIME)})
S['OrderSnapshot'] = obj({'orderId': UUID, 'requesterId': UUID, 'courierId': nullable(UUID),
    'status': enum('PENDING_CREDIT','OPEN','ACCEPTED','PICKED_UP','DELIVERED','COMPLETED','CANCELLED','EXPIRED','RESERVATION_FAILED'),
    'title': {'type':'string','minLength':1,'maxLength':120},
    'description': TEXT, 'creditReward': {'type':'integer','minimum':1}, 'pickupDeadline': TIME,
    'pickupLocationId': UUID,'dropoffLocationId': UUID,
    'pickupLocationName': nullable(TEXT), 'dropoffLocationName': nullable(TEXT)})
# Audit data is a typed discriminated union, not unrestricted event payloads.
S['EvidenceData'] = {'oneOf': [
    obj({'kind': {'const':'ORDER'}, 'fromState': nullable(TEXT), 'toState': TEXT,
         'requesterId': UUID, 'courierId': nullable(UUID), 'previousCourierId': nullable(UUID),
         'snapshot': ref('OrderSnapshot')}),
    obj({'kind': {'const':'CREDIT'}, 'operationId': UUID,
         'ledgerEntries': array(obj({'ledgerEntryId':UUID,'userId':UUID,
             'availableDelta':{'type':'integer'},'reservedDelta':{'type':'integer'},
             'availableBalance':INT,'reservedBalance':INT})),
         'reasonCode':nullable(TEXT),'result': enum('APPLIED','REJECTED','NO_CHANGE')}),
    obj({'kind': {'const':'ADMIN'}, 'caseId': UUID, 'operationId': nullable(UUID),
         'targetUserId': nullable(UUID), 'result': nullable(enum('APPLIED','REJECTED','NO_CHANGE'))})]}
S['EvidenceRecord'] = obj({'eventId': UUID, 'source': TEXT, 'stream': TEXT, 'sourceSequence': INT,
    'orderId': UUID, 'action': TEXT,'actorUserId': nullable(UUID), 'occurredAt': TIME,
    'ingestedAt': TIME,'data': ref('EvidenceData')})
S['EvidenceData']['oneOf'][2]['properties'].update(ownerEventId=UUID,ownerService=enum('user-service','credit-service'))
S['EvidenceData']['oneOf'].append(obj({'kind':{'const':'CHAT'},'caseId':UUID,'conversationId':UUID,'conversationType':enum('ERRAND','CASE'),'participantUserId':nullable(UUID),'messageId':UUID,'messageType':enum('TEXT','QUICK_REPLY','IMAGE'),'text':nullable({'type':'string','minLength':1,'maxLength':4000}),'attachment':nullable(obj({'id':UUID,'contentType':enum('image/png','image/jpeg','image/webp'),'filename':TEXT,'size':{'type':'integer','minimum':1,'maximum':5242880}}))}))
S['EvidenceData']['oneOf'][-1]['allOf']=[
    {'if':{'properties':{'messageType':{'const':'IMAGE'}}},'then':{'properties':{'text':{'type':'null'},'attachment':{'type':'object'}}},'else':{'properties':{'attachment':{'type':'null'},'text':{'type':'string'}}}},
    {'if':{'properties':{'conversationType':{'const':'CASE'}}},'then':{'properties':{'participantUserId':UUID}},'else':{'properties':{'participantUserId':{'type':'null'}}}}
]
S['OrderSnapshot']['properties'].update(reviewCaseId=nullable(UUID),reviewResolved={'type':'boolean'})
S['Eligibility'] = obj({'orderId': UUID,'userId': UUID,'eligible': {'type':'boolean'},
    'evidenceRevision': TEXT,'coverage': ref('Coverage')})
S['Timeline'] = obj({'caseId': UUID, 'orderId': UUID, 'evidenceRevision': TEXT,
    'order': ref('OrderSnapshot'),'participants': array(ref('Participant')),
    'records': array(ref('EvidenceRecord')),'coverage': ref('Coverage'), 'nextCursor': nullable(TEXT)})
S['EvidenceExport'] = obj({'orderId': UUID,'snapshotId': TEXT,'checkpoint': ref('Checkpoint'),
    'records': array(ref('EvidenceRecord')),'nextCursor': nullable(TEXT)})
S['CurrentAuthorization'] = obj({'userId': UUID,'active': {'type':'boolean'},'roles': array(enum('REQUESTER','COURIER','ADMIN'))})
S['CurrentAuthorization']['properties']['roles']['uniqueItems'] = True
S['AdminEligibility'] = obj({'userId': UUID,'active': {'type':'boolean'},'administrator': {'type':'boolean'}})
S['CaseAccess'] = obj({'caseId': UUID,'orderId': UUID,'state': enum('OPEN','UNDER_REVIEW','RESOLVED'),
    'reviewerId': nullable(UUID),'allowedParticipantIds': array(UUID),
    'canReadEvidence': {'type':'boolean'},'canReadConversation': {'type':'boolean'},'canWriteConversation': {'type':'boolean'}})
S['CaseAccess']['properties']['closureOperationId'] = nullable(UUID)
S['ClosureAcknowledgement'] = obj({'caseId':UUID,'operationId':UUID,'readOnly':{'const':True}})
S['Conversation'] = obj({'conversationId': UUID,'caseId': nullable(UUID),'orderId': UUID,
    'participantUserId': nullable(UUID),'readOnly': {'type':'boolean'}})
S['Attachment'] = obj({'attachmentId': UUID,'mediaType': enum('image/jpeg','image/png','image/webp'),
    'sizeBytes': {'type':'integer','minimum':1,'maximum':5242880}})
S['Message'] = obj({'id': UUID,'conversationId': UUID,'senderUserId': UUID,
    'sequence': {'type':'integer','minimum':1},'createdAt': TIME,
    'messageType': enum('TEXT','QUICK_REPLY','IMAGE'),
    'originalLanguage': nullable(LANGUAGE),
    'quickReplyKey': nullable(QUICK_REPLY_KEY),
    'text': nullable({'type':'string','minLength':1,'maxLength':4000}), 'attachment': nullable(ref('Attachment'))})
S['Message']['oneOf'] = [
    {'properties':{'messageType':{'const':'TEXT'},'text':{'type':'string'},
                   'quickReplyKey':{'type':'null'},'attachment':{'type':'null'}}},
    {'properties':{'messageType':{'const':'QUICK_REPLY'},'text':{'type':'string'},
                   'quickReplyKey':QUICK_REPLY_KEY,'attachment':{'type':'null'}}},
    {'properties':{'messageType':{'const':'IMAGE'},'text':{'type':'null'},
                   'quickReplyKey':{'type':'null'},'attachment':{'type':'object'}}}]
S['MessagePage'] = obj({'content': array(ref('Message')),'nextCursor': nullable(TEXT)})
S['MessageRequest'] = {'oneOf': [
    obj({'clientMessageId': UUID,'text': {'type':'string','minLength':1,'maxLength':4000}}),
    obj({'clientMessageId': UUID,'quickReplyKey': QUICK_REPLY_KEY}),
    obj({'clientMessageId': UUID,'attachmentId': UUID})]}
S['ChatPreferences'] = obj({'preferredLanguage': LANGUAGE})
S['QuickReply'] = obj({'key': QUICK_REPLY_KEY,'language': LANGUAGE,
    'text': {'type':'string','minLength':1,'maxLength':200}})
S['QuickReplyList'] = obj({'content': array(ref('QuickReply'))})
S['Translation'] = obj({'messageId': UUID,'sourceLanguage': LANGUAGE,'targetLanguage': LANGUAGE,
    'status': enum('PENDING','READY','FAILED'),'text': nullable({'type':'string','minLength':1})})
S['Notification'] = obj({'id': UUID,'type': enum('ORDER_OPENED','ORDER_RESERVATION_FAILED','ORDER_ACCEPTED',
    'ORDER_COURIER_WITHDREW','ORDER_EXPIRED','ORDER_CANCELLED','ORDER_PICKED_UP','ORDER_DELIVERED',
    'ORDER_COMPLETED','ORDER_STILL_OPEN','PICKUP_DUE_SOON','PICKUP_OVERDUE',
    'CREDITS_WELCOME','CREDITS_RECEIVED','CREDITS_COMPENSATED','CHAT_MESSAGE_RECEIVED'),
    'orderId': nullable(UUID),'message': TEXT,'occurredAt': TIME,'readAt': nullable(TIME)})
S['NotificationPage'] = obj({'content': array(ref('Notification')), 'page': INT,
    'size': {'type':'integer','minimum':1,'maximum':100},'totalElements': INT,'totalPages': INT})
S['UnreadCount'] = obj({'unreadCount': INT})

api = {'openapi':'3.1.0','info':{'title':'FoC N2H integration contracts - REVIEW DRAFT','version':'0.1.0',
    'description':'Proposed signatures, not implemented endpoints. Read README.md for ownership, approval and semantic constraints.'},
    'paths':{}, 'components': {'schemas':S,'securitySchemes': {
    'userBearer': {'type':'http','scheme':'bearer','bearerFormat':'User JWT'},
    'serviceBearer': {'type':'http','scheme':'bearer','bearerFormat':'Service JWT'},
    'actorToken': {'type':'apiKey','in':'header','name':'X-Actor-Token'}}}}
def param(name, where='query', schema=TEXT, required=False):
    return {'name':name,'in':where,'required':required,'schema':schema}
def endpoint(path, method, owner, response, body=None, code=200, internal=False, actor=False, params=(), idem=False):
    pp=[param(x,'path',UUID,True) for x in path.split('{')[1:] for x in [x.split('}')[0]]]
    pp+=list(params)
    if idem: pp.append(param('Idempotency-Key','header',UUID,True))
    op={'operationId':owner+'_'+method+'_'+path.replace('/','_').replace('{','').replace('}','').replace('-','_'),
        'tags':[owner], 'x-owner':{'orders':'order','credits':'credit'}.get(owner,owner)+'-service',
        'security':[{'serviceBearer':[],**({'actorToken':[]} if actor else {})}] if internal else [{'userBearer':[]}],
        'parameters':pp, 'responses':{str(code):{'description':'Successful result','content':{'application/json':{'schema':ref(response)}}}}}
    for err in [400,401,403,404,409,503]:
        op['responses'][str(err)]={'description':'Problem Details; see contract semantics','content':{'application/problem+json':{'schema':ref('Problem')}}}
    if body: op['requestBody']={'required':True,'content':{'application/json':{'schema':body}}}
    if '/attachments' in path and method=='post':
        op['responses']['413']={'description':'Attachment exceeds size limit','content':{'application/problem+json':{'schema':ref('Problem')}}}
    api['paths'].setdefault(path,{})[method]=op

cursor=[param('cursor'),param('limit',schema={'type':'integer','minimum':1,'maximum':100,'default':20})]
endpoint('/internal/chat/orders/{orderId}/report-eligibility','get','chat','Eligibility',internal=True,actor=True,params=[param('userId',schema=UUID,required=True)])
endpoint('/internal/chat/cases/{caseId}/timeline','get','chat','Timeline',internal=True,actor=True,params=cursor)
endpoint('/internal/chat/cases/{caseId}/conversations','post','chat','Conversation',obj({'participantUserId':UUID}),internal=True,actor=True,idem=True)
endpoint('/internal/chat/cases/{caseId}/conversations','get','chat','Conversation',internal=True,actor=True,params=[param('participantUserId',schema=UUID,required=True)])
endpoint('/internal/users/admin-operations/{operationId}','get','user','OwnerOutcome',internal=True)
endpoint('/internal/credits/admin-operations/{operationId}','get','credits','OwnerOutcome',internal=True)
endpoint('/internal/users/{userId}/authorization','get','user','CurrentAuthorization',internal=True)
endpoint('/internal/users/{userId}/admin-eligibility','get','user','AdminEligibility',internal=True)
endpoint('/internal/admin/cases/{caseId}/access','get','admin','CaseAccess',internal=True,
    params=[param('actorId',schema=UUID,required=True),param('participantId',schema=UUID)])
for owner in ['orders','credits','admin']:
    endpoint('/internal/'+owner+'/orders/{orderId}/evidence','get',owner,'EvidenceExport',internal=True,
        params=cursor+([param('caseId',schema=UUID,required=True)] if owner=='admin' else []))
endpoint('/api/chat/orders/{orderId}/conversation','get','chat','Conversation')
endpoint('/api/chat/conversations/{conversationId}','get','chat','Conversation')
endpoint('/api/chat/conversations/{conversationId}/messages','get','chat','MessagePage',params=cursor)
endpoint('/api/chat/conversations/{conversationId}/messages','post','chat','Message',ref('MessageRequest'),code=201)
endpoint('/api/chat/preferences','get','chat','ChatPreferences')
endpoint('/api/chat/preferences','put','chat','ChatPreferences',ref('ChatPreferences'))
endpoint('/api/chat/quick-replies','get','chat','QuickReplyList')
S['WebSocketTicket'] = obj({'ticket': TEXT,'expiresAt':TIME})
endpoint('/api/chat/ws-tickets','post','chat','WebSocketTicket',obj({'conversationId':UUID}),code=201)
endpoint('/api/chat/conversations/{conversationId}/messages/{messageId}/translations','post','chat','Translation',obj({'targetLanguage':LANGUAGE}),code=202)
# language path is a string, unlike UUID identifiers.
endpoint('/api/chat/conversations/{conversationId}/messages/{messageId}/translations/{language}','get','chat','Translation')
api['paths']['/api/chat/conversations/{conversationId}/messages/{messageId}/translations/{language}']['get']['parameters'][-1]['schema']=TEXT
S['Upload'] = obj({'attachmentId':UUID,'uploadUrl':{'type':'string','format':'uri'},'expiresAt':TIME,
    'requiredHeaders':{'type':'object','additionalProperties':{'type':'string'}}})
S['Download'] = obj({'downloadUrl':{'type':'string','format':'uri'},'expiresAt':TIME})
endpoint('/api/chat/conversations/{conversationId}/attachments','post','chat','Upload',obj({'mediaType':S['Attachment']['properties']['mediaType'],'sizeBytes':S['Attachment']['properties']['sizeBytes']}),code=201,idem=True)
endpoint('/api/chat/conversations/{conversationId}/attachments/{attachmentId}/complete','post','chat','Attachment',idem=True)
endpoint('/api/chat/conversations/{conversationId}/attachments/{attachmentId}/download','get','chat','Download')
endpoint('/api/notifications/me','get','notification','NotificationPage',params=[param('page',schema={**INT,'default':0}),param('size',schema={'type':'integer','minimum':1,'maximum':100,'default':20})])
endpoint('/api/notifications/me/{id}/read','patch','notification','Notification')
endpoint('/api/notifications/me/unread-count','get','notification','UnreadCount')
S['CaseSummary'] = obj({'caseId':UUID,'orderId':UUID,'state':enum('OPEN','UNDER_REVIEW','RESOLVED'),
    'reviewerId':nullable(UUID),'revision':INT,'createdAt':TIME,'reviewStatus':enum('LEGACY','PREPARING','READY','REJECTED')})
S['Statement'] = obj({'reporterId':UUID,'description':TEXT,'submittedAt':TIME})
S['Action'] = obj({'operationId':UUID,'caseId':UUID,'targetUserId':UUID,
    'type':enum('CREDIT_ADJUSTMENT','BAN'),'amount':nullable({'type':'integer'}),
    'reason':TEXT,'status':enum('PENDING','UNKNOWN','SUCCEEDED','REJECTED'),
    'reasonCode':nullable(TEXT),'createdAt':TIME,'completedAt':nullable(TIME)})
S['CaseDetail'] = obj({'case':ref('CaseSummary'),'statements':array(ref('Statement')),
    'actions':array(ref('Action')),'resolution':nullable(TEXT)})
S['ClosurePreparation'] = obj({'operationId':UUID,'resolution':TEXT,'revision':INT,
    'explanations':array(obj({'operationId':UUID,'explanation':TEXT}))})
S['CaseDetail']['properties']['closure'] = nullable(ref('ClosurePreparation'))
S['ConversationReferences'] = array(ref('Conversation'))
S['ReportPreparation']=obj({'operationId':UUID,'status':enum('PENDING','READY','REJECTED'),'failureCode':nullable(TEXT)})
S['ParticipantReport'] = obj({'case':ref('CaseSummary'),'ownStatement':nullable(ref('Statement')),'preparation':nullable(ref('ReportPreparation'))})
S['CasePage'] = obj({'content':array(ref('CaseSummary')),'page':INT,'size':INT,'totalElements':INT,'totalPages':INT})
endpoint('/api/admin/reports','post','admin','ParticipantReport',obj({'orderId':UUID,'description':TEXT}),code=202,idem=True)
endpoint('/api/admin/reports/{caseId}','get','admin','ParticipantReport')
S['ReportContext'] = {'oneOf':[
    obj({'orderId':UUID,'status':enum('OWN_REPORT','CASE_PARTICIPANT','PREPARING_REVIEW'),'caseId':UUID,'state':enum('OPEN','UNDER_REVIEW','RESOLVED')}),
    obj({'orderId':UUID,'status':enum('REPORT_REQUEST_AVAILABLE'),'caseId':{'type':'null'},'state':{'type':'null'}})]}
endpoint('/api/admin/orders/{orderId}/report-context','get','admin','ReportContext')
endpoint('/api/admin/cases','get','admin','CasePage',params=[param('status',schema=enum('OPEN','UNDER_REVIEW','RESOLVED')),
    param('query',schema=UUID),param('page',schema={**INT,'default':0}),param('size',schema={'type':'integer','minimum':1,'maximum':100,'default':20})])
endpoint('/api/admin/cases/{caseId}','get','admin','CaseDetail')
endpoint('/api/admin/cases/{caseId}/claim','post','admin','CaseSummary',obj({'expectedRevision':INT}),idem=True)
endpoint('/api/admin/cases/{caseId}/timeline','get','admin','Timeline',params=cursor)
endpoint('/api/admin/cases/{caseId}/conversations','post','admin','Conversation',obj({'participantUserId':UUID}),idem=True)
endpoint('/api/admin/cases/{caseId}/conversations','get','admin','ConversationReferences')
endpoint('/api/admin/reports/{caseId}/conversations','get','admin','ConversationReferences')
endpoint('/api/admin/cases/{caseId}/actions','post','admin','Action',{'oneOf':[
    obj({'type':{'const':'CREDIT_ADJUSTMENT'},'targetUserId':UUID,'reason':TEXT,'amount':{'type':'integer','not':{'const':0}}}),
    obj({'type':{'const':'BAN'},'targetUserId':UUID,'reason':TEXT})]},code=202,idem=True)
endpoint('/api/admin/cases/{caseId}/actions/{operationId}','get','admin','Action')
endpoint('/api/admin/cases/{caseId}/resolve','post','admin','CaseDetail',obj({'resolution':TEXT,'expectedRevision':INT,
    'rejectedActionExplanations':{'type':'array','maxItems':1000,'items':obj({'operationId':UUID,'explanation':TEXT})}}, ['resolution','expectedRevision']),code=202,idem=True)

# Dispute contracts approved in the report-view continuation; existing lifecycle states are retained.
DISPOSITION=enum('RETURN_TO_REQUESTER','PAY_COURIER','KEEP_EXISTING')
S['ClosurePreparation']['properties']['creditDisposition']=DISPOSITION
api['paths']['/api/admin/cases/{caseId}/resolve']['post']['requestBody']['content']['application/json']['schema']['properties']['creditDisposition']=DISPOSITION
S['OrderReview']=obj({'orderId':UUID,'caseId':UUID,'requesterId':UUID,'courierId':nullable(UUID),'state':S['OrderSnapshot']['properties']['status'],'creditStatus':nullable(enum('RESERVED','RELEASED','SETTLED','COMPENSATED')),'resolved':{'type':'boolean'},'participants':array(UUID)})
S['DisputeCreditReceipt']=obj({'operationId':UUID,'caseId':UUID,'orderId':UUID,'disposition':DISPOSITION,'reservationStatus':enum('ABSENT','RELEASED','SETTLED','COMPENSATED'),'complete':{'const':True}})
S['ErrandReviewAcknowledgement']=obj({'orderId':UUID,'caseId':UUID,'readOnly':{'const':True}})
# Accepted preparations are not completed business operations. Original retries can return completion.
for path,completed in [('/api/admin/reports','201'),('/api/admin/cases/{caseId}/resolve','200')]:
    op=api['paths'][path]['post']
    op['responses'][completed]=copy.deepcopy(op['responses']['202'])
    op['responses']['202']['description']='Durably queued; owner confirmations pending'
    op['responses'][completed]['description']='Original operation completed'
claim=api['paths']['/api/admin/cases/{caseId}/claim']['post']
claim['responses']['202']=copy.deepcopy(claim['responses']['200'])
claim['responses']['202']['description']='Legacy review preparation queued; reviewer is not assigned yet'
S['ImageBytes']={'type':'string','format':'binary'}
for path,owner,internal in [('/internal/chat/cases/{caseId}/messages/{messageId}/attachment','chat',True),('/api/admin/cases/{caseId}/messages/{messageId}/attachment','admin',False)]:
    endpoint(path,'get',owner,'ImageBytes',internal=internal,actor=internal)
    api['paths'][path]['get']['responses']['200']['content']={kind:{'schema':ref('ImageBytes')} for kind in ['image/png','image/jpeg','image/webp']}

# Standalone JSON Schema 2020-12 for NEW Kafka messages only.
baseids={'operationId':UUID,'caseId':UUID,'orderId':UUID,'targetUserId':UUID,'requestedBy':UUID}
command={**baseids,'caseRevision':INT,'reason':TEXT}
outcome={**baseids,'completedAt':TIME,'result':enum('APPLIED','NO_CHANGE','REJECTED')}
reject=enum('ACTOR_NOT_AUTHORIZED','ACCOUNT_NOT_FOUND','INVALID_REQUEST','INSUFFICIENT_AVAILABLE_CREDITS',
    'NUMERIC_LIMIT','SELF_SANCTION_FORBIDDEN','LAST_ADMIN_PROTECTED','INVALID_ACCOUNT_STATE')
variants=[]
def event(name,producer,aggregate,topic,data,actor_user=True):
    actor=obj({'type':{'const':'USER'},'userId':UUID,'role':enum('ADMIN')}) if actor_user else {'oneOf':[
        obj({'type':{'const':'USER'},'userId':UUID,'role':enum('REQUESTER','COURIER','ADMIN')}),obj({'type':{'const':'SYSTEM'}})]}
    schema=obj({'eventId':UUID,'eventType':{'const':name},'eventVersion':{'const':1},
        'aggregateType':{'const':aggregate},'aggregateId':UUID,
        'aggregateVersion':{'const':1} if aggregate=='AdminAction' else INT,
        'occurredAt':TIME,'producer':{'const':producer},'correlationId':UUID,
        'causationId':nullable(UUID),'actor':actor,'data':data})
    schema['title']=name; schema['x-topic']=topic; variants.append(schema)
event('AdminCreditCorrectionRequested','admin-service','AdminAction','admin.credit.commands',obj({**command,'amount':{'type':'integer','not':{'const':0}}}))
event('AdminUserBanRequested','admin-service','AdminAction','admin.user.commands',obj(command))
event('AdminCreditCorrectionApplied','credit-service','AdminAction','credit.admin.events',obj({**outcome,
    'result':{'const':'APPLIED'},'amount':{'type':'integer','not':{'const':0}},
    'availableBalance':INT,'reservedBalance':INT,'ledgerEntryId':UUID}))
event('AdminCreditCorrectionRejected','credit-service','AdminAction','credit.admin.events',obj({**outcome,'amount':{'type':'integer','not':{'const':0}},'result':{'const':'REJECTED'},'reasonCode':reject}))
event('AdminUserBanApplied','user-service','AdminAction','user.admin.events',obj({**outcome,
    'result':enum('APPLIED','NO_CHANGE'),'previousStatus':enum('ACTIVE','BANNED'),'status':{'const':'BANNED'}}))
event('AdminUserBanRejected','user-service','AdminAction','user.admin.events',obj({**outcome,'result':{'const':'REJECTED'},'reasonCode':reject}))
ORDER_ACTIONS=['SUBMIT','OPEN','FAIL_RESERVATION','CANCEL','EXPIRE','ACCEPT','WITHDRAW','PICK_UP','DELIVER','COMPLETE','EDIT','REWARD_CHANGE_APPLIED','REWARD_CHANGE_REJECTED','REVIEW_STARTED','DISPUTE_RESOLVED']
life={'orderId':UUID,'requesterId':UUID,'previousCourierId':nullable(UUID),'courierId':nullable(UUID),
      'fromState':nullable(S['OrderSnapshot']['properties']['status']),'toState':S['OrderSnapshot']['properties']['status'],'action':enum(*ORDER_ACTIONS),'sourceSequence':{'type':'integer','minimum':1},
      'reasonCode':nullable(TEXT),'snapshot':copy.deepcopy(S['OrderSnapshot'])}
event('OrderTransitioned','order-service','Order','order.lifecycle.events',obj(life),False)
event('ChatMessageSent','chat-service','Conversation','chat.events',obj({
    'messageId':UUID,'conversationId':UUID,'orderId':UUID,'senderUserId':UUID,
    'recipientUserId':UUID,'messageType':enum('TEXT','QUICK_REPLY','IMAGE'),
    'messagePreview':{'type':'string','minLength':1,'maxLength':160}},
    ['messageId','conversationId','orderId','senderUserId','recipientUserId','messageType']))
variants[-1]['properties']['aggregateVersion']={'type':'integer','minimum':1}
variants[-1]['properties']['causationId']=UUID
variants[-1]['properties']['actor']=obj({'type':{'const':'USER'},'userId':UUID,
    'role':enum('REQUESTER','COURIER')}, ['type','userId'])
commoncase={'caseId':UUID,'orderId':UUID,'sourceSequence':{'type':'integer','minimum':1}}
event('DisputeCreditsFinalized','credit-service','Order','credit.events',obj({'operationId':UUID,'orderId':UUID,'caseId':UUID,'disposition':DISPOSITION,'reservationStatus':enum('ABSENT','RELEASED','SETTLED','COMPENSATED')}))
event('CaseOpened','admin-service','AdminCase','admin.events',obj({**commoncase,'reporterId':UUID}),False)
event('CaseClaimed','admin-service','AdminCase','admin.events',obj({**commoncase,'reviewerId':UUID}))
event('CaseActionCompleted','admin-service','AdminCase','admin.events',obj({**commoncase,'operationId':UUID,
    'ownerEventId':UUID,'targetUserId':UUID,'result':enum('APPLIED','NO_CHANGE','REJECTED')}))
event('CaseResolved','admin-service','AdminCase','admin.events',obj({**commoncase,'reviewerId':UUID,'resolvedAt':TIME}))
events={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'FoC N2H Kafka review draft',
        'description':'New messages only. Existing core v1 event schemas are not redefined.', 'oneOf':variants}
S['OwnerOutcome'] = {'oneOf':[copy.deepcopy(v) for v in variants if v['title'] in {
    'AdminCreditCorrectionApplied','AdminCreditCorrectionRejected','AdminUserBanApplied','AdminUserBanRejected'}]}
write('n2h.openapi.json',api)
write('n2h-events.schema.json',events)

# Valid fixtures for each new event branch; cross-field relationships set explicitly below.
U='11111111-1111-4111-8111-111111111111'; T='2026-10-29T12:00:00Z'
def sample(s):
    if '$ref' in s: return sample(S[s['$ref'].split('/')[-1]])
    if 'const' in s: return s['const']
    if 'enum' in s: return s['enum'][0]
    if 'anyOf' in s: return sample(s['anyOf'][0])
    if 'oneOf' in s and 'properties' not in s: return sample(s['oneOf'][0])
    typ=s.get('type')
    if typ=='object':
        value={k:sample(v) for k,v in s.get('properties',{}).items() if k in s.get('required',[])}
        if {'conversationId','senderUserId','messageType','attachment','text'}.issubset(value):
            value.update(messageType='TEXT',attachment=None,quickReplyKey=None)
        return value
    if typ=='array': return []
    if typ=='integer': return max(1,s.get('minimum',0))
    if typ=='boolean': return True
    if typ=='null': return None
    return U if s.get('format')=='uuid' else T if s.get('format')=='date-time' else 'https://example.invalid/resource' if s.get('format')=='uri' else 'example'
fixtures=[]
for index,v in enumerate(variants):
    payload=sample(v); payload['eventId']=f'00000000-0000-4000-8000-{index+1:012d}'
    if payload['actor']['type']=='USER': payload['actor']['userId']='22222222-2222-4222-8222-222222222222'
    if 'requestedBy' in payload['data']: payload['data']['requestedBy']=payload['actor']['userId']
    if 'reviewerId' in payload['data']: payload['data']['reviewerId']=payload['actor']['userId']
    if payload['eventType'].endswith('Requested'): payload['causationId']=None
    if payload['eventType']=='OrderTransitioned':
        payload['actor']['role']='COURIER'
        payload['data'].update(fromState='OPEN',toState='ACCEPTED',action='ACCEPT',
            previousCourierId=None,courierId=payload['actor']['userId'],reasonCode=None)
        payload['data']['snapshot'].update(status='ACCEPTED',courierId=payload['actor']['userId'])
    if payload['eventType']=='ChatMessageSent':
        payload['actor']['role']='REQUESTER'
        payload['aggregateId']=payload['data']['conversationId']
        payload['correlationId']=payload['data']['orderId']
        payload['causationId']=payload['data']['messageId']
        payload['data']['senderUserId']=payload['actor']['userId']
        payload['data']['messagePreview']='I am on my way.'
    fixtures.append({'topic':v['x-topic'],'key':U,'event':payload})
write('events.examples.json',fixtures)
http=[]
for path, methods in api['paths'].items():
    for method, op in methods.items():
        success=next(k for k in op['responses'] if k.startswith('2'))
        content=op['responses'][success]['content']
        if 'application/json' not in content: continue  # Binary routes are verified by authenticated HTTP/image tests.
        example=sample(content['application/json']['schema'])
        if path == '/internal/users/admin-operations/{operationId}':
            example=sample(next(v for v in variants if v['title']=='AdminUserBanApplied'))
        item={'operationId':op['operationId'],'status':int(success),'body':example}
        if 'requestBody' in op: item['requestBody']=sample(op['requestBody']['content']['application/json']['schema'])
        if path == '/api/admin/cases/{caseId}/resolve':
            item['requestBody']['rejectedActionExplanations'] = []
            item['body']['case']['state'] = 'UNDER_REVIEW'
            item['body']['case']['reviewStatus'] = 'READY'
            item['body']['actions'] = []
        if path == '/api/admin/reports' and method == 'post':
            item['body']['ownStatement']=None
            item['body']['preparation']['status']='PENDING'
            item['body']['case'].update(state='OPEN',reviewStatus='PREPARING',reviewerId=None,revision=0)
        if path == '/api/chat/quick-replies':
            item['body']['content'] = [
                {'key':'ON_MY_WAY','language':'en','text':"I'm on my way."},
                {'key':'ARRIVED','language':'en','text':"I've arrived."},
                {'key':'RUNNING_LATE_5','language':'en','text':"I'm running 5 minutes late."},
                {'key':'WHERE_MEET','language':'en','text':'Where should we meet?'},
                {'key':'THANK_YOU','language':'en','text':'Thank you!'}]
        http.append(item)
write('http.examples.json',http)
websocket={'$schema':'https://json-schema.org/draft/2020-12/schema', 'title':'Chat WebSocket frames - review draft',
    '$defs':copy.deepcopy(S),'oneOf':[
        obj({'type':{'const':'AUTHENTICATE'},'ticket':TEXT}),
        obj({'type':{'const':'SUBSCRIBE'},'conversationId':UUID,'afterSequence':INT}),
        obj({'type':{'const':'AUTHENTICATED'},'expiresAt':TIME}),
        obj({'type':{'const':'MESSAGE_CREATED'},'message':ref('Message')}),
        obj({'type':{'const':'TRANSLATION_UPDATED'},'conversationId':UUID,'translation':ref('Translation')}),
        obj({'type':{'const':'ERROR'},'code':enum('INVALID_TICKET','FORBIDDEN','SESSION_EXPIRED','UNAVAILABLE')})]}
# Standalone schema local references use $defs rather than OpenAPI components.
websocket['$defs'].pop('ReportContext', None)  # Admin HTTP lookup is not a Chat wire change.
for http_only in ['OwnerOutcome','ClosureAcknowledgement','ConversationReferences']:
    websocket['$defs'].pop(http_only, None)
write('chat-websocket.schema.json',json.loads(json.dumps(websocket).replace('#/components/schemas/','#/$defs/')))
write('websocket.examples.json',[sample(branch) for branch in websocket['oneOf']])
print(f'Generated {len(api["paths"])} HTTP paths, {len(variants)} new event variants and examples.')

# Separate dispute envelope: actor identity, never a bearer credential or private statement text.
dispute_types={
 'PrepareReview':('admin-service','admin.dispute.commands',obj({'intent':enum('REPORT','LEGACY')})),
 'PrepareResolution':('admin-service','admin.dispute.commands',obj({'disposition':DISPOSITION})),
 'OrderReviewFrozen':('order-service','order.dispute.events',S['OrderReview']),
 'ErrandReviewPrepared':('chat-service','chat.dispute.events',obj({'readOnly':{'const':True},'orderConfirmationId':UUID})),
 'CaseClosurePrepared':('chat-service','chat.dispute.events',obj({'readOnly':{'const':True}})),
 'SettleDisputeCredits':('order-service','order.dispute.commands',obj({'requesterId':UUID,'courierId':nullable(UUID),'disposition':DISPOSITION})),
 'DisputeCreditsSettled':('credit-service','credit.dispute.events',obj({**S['DisputeCreditReceipt']['properties'],'requesterId':UUID,'courierId':nullable(UUID)})),
 'OrderDisputeFinalized':('order-service','order.dispute.events',obj({**S['OrderReview']['properties'],'disposition':DISPOSITION,'creditConfirmationId':UUID})),
}
dispute_variants=[]
for kind,(producer,topic,data) in dispute_types.items():
    schema=obj({'eventId':UUID,'eventVersion':{'const':1},'type':{'const':kind},'producer':{'const':producer},'operationId':UUID,'caseId':UUID,'orderId':UUID,'actorId':UUID,'actorRole':enum('ADMIN','REQUESTER','COURIER'),'occurredAt':TIME,'data':copy.deepcopy(data)})
    if kind not in ('PrepareReview','OrderReviewFrozen','ErrandReviewPrepared'):schema['properties']['actorRole']={'const':'ADMIN'}
    if kind=='OrderDisputeFinalized':schema['properties']['data']['properties']['resolved']={'const':True}
    schema['title']=kind;schema['x-topic']=topic;dispute_variants.append(schema)
write('dispute.schema.json',{'$schema':'https://json-schema.org/draft/2020-12/schema','title':'FoC durable dispute coordination v1','oneOf':dispute_variants})
write('dispute.examples.json',[{'topic':v['x-topic'],'key':sample(v)['orderId'],'message':sample(v)} for v in dispute_variants])
