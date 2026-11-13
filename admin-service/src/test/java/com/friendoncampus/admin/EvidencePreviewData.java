package com.friendoncampus.admin;

import java.time.Instant;
import java.util.*;

/** Synthetic, deterministic manual fixture. Never represents real Order/Credit/Chat history. */
final class EvidencePreviewData {
    @SuppressWarnings("unchecked")
    static Map<String,Object> create(UUID caseId,UUID orderId,UUID actor,boolean incomplete) {
        var data=EvidenceFixtures.timeline();data.put("caseId",caseId);data.put("orderId",orderId);
        data.put("evidenceRevision","TEST-ONLY-synthetic-evidence-v1");
        var order=(Map<String,Object>)data.get("order");order.put("orderId",orderId);order.put("requesterId",actor);order.put("title","TEST ONLY — synthetic errand timeline");
        order.put("description","Explicit local fixture data. This is not a real producer history or Chat completeness verification.");
        Map<String,Object> requester=new LinkedHashMap<>();requester.put("userId",actor);requester.put("relationship","REQUESTER");requester.put("assignedAt",null);requester.put("unassignedAt",null);
        Map<String,Object> courier=new LinkedHashMap<>();courier.put("userId",EvidenceFixtures.ACTOR);courier.put("relationship","HISTORICAL_COURIER");courier.put("assignedAt",EvidenceFixtures.TIME);courier.put("unassignedAt","2026-10-29T11:00:00Z");
        data.put("participants",List.of(requester,courier));
        List<Map<String,Object>> records=new ArrayList<>();
        for(int i=1;i<=25;i++){
            var details=new LinkedHashMap<String,Object>();details.put("kind","ORDER");details.put("fromState","OPEN");details.put("toState","OPEN");details.put("requesterId",actor);details.put("courierId",null);details.put("previousCourierId",null);details.put("snapshot",order);
            String time=Instant.parse(EvidenceFixtures.TIME).plusSeconds(i).toString();
            records.add(Map.of("eventId",UUID.nameUUIDFromBytes((caseId+":fixture:"+i).getBytes(java.nio.charset.StandardCharsets.UTF_8)),"source","order-service","stream","order.lifecycle.events","sourceSequence",i,"orderId",orderId,"action","TEST_ONLY_SNAPSHOT_"+i,"actorUserId",actor,"occurredAt",time,"ingestedAt",time,"data",details));
        }
        data.put("records",records);
        var checkpoints=List.of(Map.of("source","order-service","stream","order.lifecycle.events","aggregateId",orderId,"committedSequence",25,"projectedSequence",incomplete?23:25,"checkedAt",EvidenceFixtures.TIME),
                Map.of("source","credit-service","stream","credit.events","aggregateId",orderId,"committedSequence",0,"projectedSequence",0,"checkedAt",EvidenceFixtures.TIME),
                Map.of("source","admin-service","stream","admin.events","aggregateId",caseId,"committedSequence",2,"projectedSequence",2,"checkedAt",EvidenceFixtures.TIME));
        var gaps=incomplete?List.of(Map.of("source","order-service","stream","order.lifecycle.events","aggregateId",orderId,"fromSequence",24,"toSequence",25,"reason","MISSING_SEQUENCE")):List.of();
        data.put("coverage",Map.of("status",incomplete?"INCOMPLETE":"COMPLETE","asOf",EvidenceFixtures.TIME,"checkpoints",checkpoints,"blockingGaps",gaps));
        return data;
    }
}
