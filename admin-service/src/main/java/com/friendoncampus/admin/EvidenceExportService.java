package com.friendoncampus.admin;

import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Producer-owned lifecycle history only, independent of Chat and broker delivery state. */
@Service
public class EvidenceExportService {
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;
    private final JsonMapper json=JsonMapper.builder().build();
    public EvidenceExportService(JdbcTemplate db,PlatformTransactionManager manager){
        this.db=db;transaction=new TransactionTemplate(manager);transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);transaction.setTimeout(15);
    }
    public Export read(UUID orderId,UUID caseId,String cursor,int limit){
        if(limit<1||limit>100)throw bad("Limit must be between 1 and 100.");
        UUID token=null;
        if(cursor!=null){try{token=UUID.fromString(cursor);}catch(Exception ex){throw bad("Invalid evidence cursor.");}}
        UUID cursorId=token;
        return transaction.execute(status->{
            var cases=db.queryForList("SELECT source_sequence FROM admin_cases WHERE id=? AND order_id=?",caseId,orderId);
            if(cases.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Case not found.");
            Snapshot snapshot; int offset=0;
            if(cursorId==null){snapshot=create(orderId,caseId,((Number)cases.get(0).get("source_sequence")).longValue());}
            else {
                var cursors=db.queryForList("SELECT s.id,s.case_id,s.order_id,s.committed_sequence,s.checked_at,s.records,c.record_offset,c.page_limit FROM admin_evidence_cursors c JOIN admin_evidence_snapshots s ON s.id=c.snapshot_id WHERE c.token=?",cursorId);
                if(cursors.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Evidence snapshot is unavailable. Restart recovery without a cursor.");
                var saved=cursors.get(0);
                if(!caseId.equals(saved.get("case_id"))||!orderId.equals(saved.get("order_id")))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Case not found.");
                if(((Number)saved.get("page_limit")).intValue()!=limit)throw bad("Keep the same limit while paging an evidence snapshot.");
                snapshot=new Snapshot((UUID)saved.get("id"),((Number)saved.get("committed_sequence")).longValue(),instant(saved.get("checked_at")),json.readTree((String)saved.get("records")));
                offset=((Number)saved.get("record_offset")).intValue();
            }
            List<JsonNode> records=new ArrayList<>();
            int end=Math.min(offset+limit,snapshot.records.size());
            for(int i=offset;i<end;i++)records.add(snapshot.records.get(i));
            String next=null;
            if(end<snapshot.records.size()){
                UUID nextId=UUID.randomUUID();
                db.update("INSERT INTO admin_evidence_cursors(token,snapshot_id,record_offset,page_limit) VALUES (?,?,?,?) ON CONFLICT(snapshot_id,record_offset,page_limit) DO NOTHING",nextId,snapshot.id,end,limit);
                next=db.queryForObject("SELECT token FROM admin_evidence_cursors WHERE snapshot_id=? AND record_offset=? AND page_limit=?",UUID.class,snapshot.id,end,limit).toString();
            }
            return new Export(orderId,snapshot.id.toString(),new Checkpoint("admin-service","admin.events",caseId,snapshot.sequence,snapshot.checkedAt),records,next);
        });
    }
    private Snapshot create(UUID orderId,UUID caseId,long committed){
        if(committed<1)throw missingBaseline();
        var rows=db.queryForList("SELECT event_id,source_sequence,event_type,payload,created_at FROM admin_case_outbox WHERE case_id=? AND source_sequence<=? ORDER BY source_sequence",caseId,committed);
        if(rows.size()!=committed)throw missingBaseline();
        List<Map<String,Object>> records=new ArrayList<>();long expected=1;
        for(var row:rows){
            long sequence=((Number)row.get("source_sequence")).longValue(); var event=json.readTree((String)row.get("payload"));
            String type=(String)row.get("event_type");
            if(sequence!=expected++||sequence==1&&!"CaseOpened".equals(type))throw missingBaseline();
            try{
                EvidenceValidation.equalUuid(event,"eventId",(UUID)row.get("event_id"));
                EvidenceValidation.equalUuid(event,"aggregateId",caseId); EvidenceValidation.equalUuid(event.path("data"),"caseId",caseId); EvidenceValidation.equalUuid(event.path("data"),"orderId",orderId);
                EvidenceValidation.require(event.path("eventVersion").asInt()==1 && event.path("eventVersion").isIntegralNumber());
                EvidenceValidation.require(type.equals(event.path("eventType").asText())&&"admin-service".equals(event.path("producer").asText())&&"AdminCase".equals(event.path("aggregateType").asText()));
                EvidenceValidation.require(Set.of("CaseOpened","CaseClaimed","CaseActionCompleted","CaseResolved").contains(type));
                EvidenceValidation.number(event.path("data"),"sourceSequence"); EvidenceValidation.require(event.path("data").path("sourceSequence").asLong()==sequence);
                EvidenceValidation.time(event,"occurredAt"); EvidenceValidation.uuid(event.path("actor"),"userId");
                EvidenceValidation.require("USER".equals(event.path("actor").path("type").asText()));
                UUID actor=EvidenceValidation.uuid(event.path("actor"),"userId");
                if(!"CaseActionCompleted".equals(type))EvidenceValidation.equalUuid(event.path("data"),"CaseOpened".equals(type)?"reporterId":"reviewerId",actor);
                else {EvidenceValidation.uuid(event.path("data"),"operationId");EvidenceValidation.uuid(event.path("data"),"ownerEventId");EvidenceValidation.uuid(event.path("data"),"targetUserId");EvidenceValidation.choice(event.path("data"),"result",Set.of("APPLIED","REJECTED","NO_CHANGE"));}
                EvidenceValidation.choice(event.path("actor"),"role","CaseOpened".equals(type)?Set.of("REQUESTER","COURIER"):Set.of("ADMIN"));
                if("CaseResolved".equals(type))EvidenceValidation.time(event.path("data"),"resolvedAt");
            }catch(Exception ex){throw missingBaseline();}
            Map<String,Object> data=new LinkedHashMap<>();data.put("kind","ADMIN");data.put("caseId",caseId);data.put("operationId",null);data.put("targetUserId",null);data.put("result",null);
            if("CaseActionCompleted".equals(type)){
                for(String field:List.of("operationId","ownerEventId","targetUserId","result"))data.put(field,event.path("data").path(field).asText());
                String actionType=db.queryForObject("SELECT type FROM admin_actions WHERE operation_id=?",String.class,UUID.fromString(event.path("data").path("operationId").asText()));
                data.put("ownerService","BAN".equals(actionType)?"user-service":"credit-service");
            }
            Map<String,Object> record=new LinkedHashMap<>();
            record.put("eventId",row.get("event_id"));record.put("source","admin-service");record.put("stream","admin.events");record.put("sourceSequence",sequence);record.put("orderId",orderId);
            record.put("action",type);record.put("actorUserId",event.path("actor").path("userId").asText());record.put("occurredAt",event.path("occurredAt").asText());
            // In a producer export, this is the stable local persistence timestamp, not Chat ingestion time.
            record.put("ingestedAt",instant(row.get("created_at")));record.put("data",data);records.add(record);
        }
        UUID id=UUID.randomUUID();Instant checkedAt=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);String serialized=json.writeValueAsString(records);
        db.update("INSERT INTO admin_evidence_snapshots(id,case_id,order_id,committed_sequence,checked_at,records) VALUES (?,?,?,?,?,?)",id,caseId,orderId,committed,checkedAt.atOffset(ZoneOffset.UTC),serialized);
        return new Snapshot(id,committed,checkedAt,json.readTree(serialized));
    }
    private static ResponseStatusException bad(String detail){return new ResponseStatusException(HttpStatus.BAD_REQUEST,detail);}
    private static Instant instant(Object value){
        if(value instanceof OffsetDateTime time)return time.toInstant();
        if(value instanceof java.sql.Timestamp time)return time.toInstant();
        throw new IllegalArgumentException("Unsupported database timestamp");
    }
    private static ResponseStatusException missingBaseline(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A trustworthy Admin evidence baseline is unavailable. Recovery remains incomplete.");}
    private record Snapshot(UUID id,long sequence,Instant checkedAt,JsonNode records) { }
    public record Checkpoint(String source,String stream,UUID aggregateId,long committedSequence,Instant checkedAt) { }
    public record Export(UUID orderId,String snapshotId,Checkpoint checkpoint,List<JsonNode> records,String nextCursor) { }
}
