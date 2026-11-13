package com.friendoncampus.order.service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Pins the immutable original outbox prefix; legacy/missing history is never invented. */
public class OrderEvidenceExportService {
    private final JdbcClient db;
    private final JsonMapper json=JsonMapper.builder().build();
    public OrderEvidenceExportService(JdbcClient db){this.db=db;}
    public Export read(UUID orderId,String cursor,int limit){
        if(limit<1||limit>100)throw bad("Limit must be between 1 and 100");
        long committed=db.sql("SELECT lifecycle_sequence FROM orders WHERE id=:id").param("id",orderId)
                .query(Long.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Order not found"));
        int offset=0;long pinned=committed;
        if(cursor!=null){
            try{String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split(":");
                if(parts.length!=2)throw new IllegalArgumentException();pinned=Long.parseLong(parts[0]);offset=Integer.parseInt(parts[1]);
                if(pinned<1||pinned>committed||offset<0||offset>pinned)throw new IllegalArgumentException();
            }catch(Exception ex){throw bad("Invalid evidence cursor");}
        }
        List<JsonNode> events=db.sql("SELECT payload::text FROM outbox_events WHERE aggregate_id=:id AND topic='order.lifecycle.events' AND (payload->'data'->>'sourceSequence')::bigint<=:pinned ORDER BY (payload->'data'->>'sourceSequence')::bigint")
                .param("id",orderId).param("pinned",pinned).query(String.class).list().stream().map(json::readTree).toList();
        if(events.isEmpty()||events.size()!=pinned||!"SUBMIT".equals(events.get(0).path("data").path("action").asText())||!events.get(0).path("data").path("fromState").isNull())throw incomplete();
        List<Map<String,Object>> records=new ArrayList<>();long expected=1;
        for(JsonNode event:events){
            JsonNode data=event.path("data");
            if(data.path("sourceSequence").asLong()!=expected++||!orderId.toString().equals(data.path("orderId").asText())
                    ||!orderId.toString().equals(event.path("aggregateId").asText())||!"order-service".equals(event.path("producer").asText()))throw incomplete();
            Map<String,Object> facts=new LinkedHashMap<>(json.convertValue(data,Map.class));facts.put("kind","ORDER");
            Map<String,Object> record=new LinkedHashMap<>();record.put("eventId",UUID.fromString(event.path("eventId").asText()));
            record.put("source","order-service");record.put("stream","order.lifecycle.events");record.put("sourceSequence",data.path("sourceSequence").asLong());
            record.put("orderId",orderId);record.put("action",data.path("action").asText());
            String actor=event.path("actor").path("userId").asText(null);record.put("actorUserId",actor==null?null:UUID.fromString(actor));
            record.put("occurredAt",event.path("occurredAt").asText());record.put("ingestedAt",event.path("occurredAt").asText());record.put("data",facts);records.add(record);
        }
        int end=Math.min(offset+limit,records.size());
        String next=end<records.size()?Base64.getUrlEncoder().withoutPadding().encodeToString((pinned+":"+end).getBytes(StandardCharsets.UTF_8)):null;
        return new Export(orderId,"order-"+orderId+"-"+pinned,new Checkpoint("order-service","order.lifecycle.events",orderId,pinned,Instant.now()),records.subList(offset,end),next);
    }
    private static ResponseStatusException bad(String detail){return new ResponseStatusException(HttpStatus.BAD_REQUEST,detail);}
    private static ResponseStatusException incomplete(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A trustworthy Order evidence baseline is unavailable");}
    public record Checkpoint(String source,String stream,UUID aggregateId,long committedSequence,Instant checkedAt){}
    public record Export(UUID orderId,String snapshotId,Checkpoint checkpoint,List<Map<String,Object>> records,String nextCursor){}
}