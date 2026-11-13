package com.friendoncampus.admin;

import java.time.Instant;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Deterministic shape fixture; no assertion of real Chat or producer history. */
final class EvidenceFixtures {
    static final UUID CASE=UUID.fromString("10000000-0000-4000-8000-000000000001"), ORDER=UUID.fromString("20000000-0000-4000-8000-000000000001"), ACTOR=UUID.fromString("30000000-0000-4000-8000-000000000001");
    static final String TIME="2026-10-29T10:00:00Z";
    static Map<String,Object> timeline() {
        Map<String,Object> snapshot=new LinkedHashMap<>();
        snapshot.put("orderId",ORDER);snapshot.put("requesterId",ACTOR);snapshot.put("courierId",null);snapshot.put("status","OPEN");snapshot.put("title","Fixture errand");snapshot.put("description","Test-only historical snapshot");snapshot.put("creditReward",10);snapshot.put("pickupDeadline",TIME);snapshot.put("pickupLocationId",ACTOR);snapshot.put("dropoffLocationId",CASE);snapshot.put("pickupLocationName",null);snapshot.put("dropoffLocationName",null);
        Map<String,Object> participant=new LinkedHashMap<>();participant.put("userId",ACTOR);participant.put("relationship","REQUESTER");participant.put("assignedAt",null);participant.put("unassignedAt",null);
        List<Map<String,Object>> checkpoints=new ArrayList<>();
        for(String[] source:List.of(new String[]{"order-service","order.lifecycle.events",ORDER.toString()},new String[]{"credit-service","credit.events",ORDER.toString()},new String[]{"admin-service","admin.events",CASE.toString()}))
            checkpoints.add(new LinkedHashMap<>(Map.of("source",source[0],"stream",source[1],"aggregateId",source[2],"committedSequence",1,"projectedSequence",1,"checkedAt",TIME)));
        Map<String,Object> coverage=new LinkedHashMap<>(Map.of("status","COMPLETE","asOf",TIME,"checkpoints",checkpoints,"blockingGaps",List.of()));
        Map<String,Object> result=new LinkedHashMap<>();result.put("caseId",CASE);result.put("orderId",ORDER);result.put("evidenceRevision","fixture-revision-1");result.put("order",snapshot);result.put("participants",List.of(participant));result.put("records",List.of());result.put("coverage",coverage);result.put("nextCursor",null);return result;
    }
    static String serialize(Object value){return JsonMapper.builder().build().writeValueAsString(value);}
}
