package com.friendoncampus.admin;

import java.time.Instant;
import java.util.*;
import tools.jackson.databind.JsonNode;

/** Validate the documented evidence shapes before they reach the browser or recovery consumer. */
final class EvidenceValidation {
    private static final tools.jackson.databind.json.JsonMapper JSON=tools.jackson.databind.json.JsonMapper.builder().build();
    private EvidenceValidation() { }
    static final Set<String> STATES = Set.of("PENDING_CREDIT","OPEN","ACCEPTED","PICKED_UP","DELIVERED","COMPLETED","CANCELLED","EXPIRED","RESERVATION_FAILED");
    static void timeline(JsonNode node, UUID caseId, UUID orderId) {
        equalUuid(node,"caseId",caseId); equalUuid(node,"orderId",orderId); text(node,"evidenceRevision");
        snapshot(node.path("order"),orderId);
        array(node,"participants"); array(node,"records");
        for(var p:node.path("participants")) {
            uuid(p,"userId"); choice(p,"relationship",Set.of("REQUESTER","HISTORICAL_COURIER"));
            nullableTime(p,"assignedAt"); nullableTime(p,"unassignedAt");
            if (!p.path("assignedAt").isNull() && !p.path("unassignedAt").isNull())
                require(!Instant.parse(p.path("unassignedAt").asText()).isBefore(Instant.parse(p.path("assignedAt").asText())));
        }
        Set<UUID> ids=new HashSet<>(); JsonNode previous=null;
        for(var record:node.path("records")) {
            record(record,orderId); require(ids.add(uuid(record,"eventId")));
            if(previous!=null) require(compare(previous,record)<=0);
            previous=record;
            if(Set.of("ADMIN","CHAT").contains(record.path("data").path("kind").asText())) equalUuid(record.path("data"),"caseId",caseId);
        }
        var coverage=node.path("coverage"); choice(coverage,"status",Set.of("COMPLETE","INCOMPLETE","UNKNOWN")); time(coverage,"asOf");
        array(coverage,"checkpoints"); array(coverage,"blockingGaps");
        Set<String> streams=new HashSet<>();
        for(var cp:coverage.path("checkpoints")) {
            checkpoint(cp); number(cp,"projectedSequence");
            UUID aggregate=uuid(cp,"aggregateId");
            require(streams.add(cp.path("source").asText()+"/"+cp.path("stream").asText()+"/"+aggregate));
            require(aggregate.equals(orderId)||aggregate.equals(caseId));
        }
        for(var gap:coverage.path("blockingGaps")) {
            text(gap,"source"); text(gap,"stream"); UUID aggregate=uuid(gap,"aggregateId"); require(aggregate.equals(orderId)||aggregate.equals(caseId));
            number(gap,"fromSequence"); number(gap,"toSequence"); require(gap.path("toSequence").asLong()>=gap.path("fromSequence").asLong());
            choice(gap,"reason",Set.of("MISSING_SEQUENCE","BACKFILL_PENDING","SOURCE_UNAVAILABLE","FAILED_INGESTION"));
        }
        require(node.has("nextCursor"));
        if(!node.path("nextCursor").isNull()) require(node.path("nextCursor").isString() && !node.path("nextCursor").asText().isBlank() && node.path("nextCursor").asText().length()<=4096);
        // A contradictory COMPLETE response is rejected, never relabelled or silently trusted.
        if("COMPLETE".equals(coverage.path("status").asText())) {
            require(!coverage.path("checkpoints").isEmpty() && coverage.path("blockingGaps").isEmpty());
            boolean requesterPresent=false,currentCourierPresent=node.path("order").path("courierId").isNull();
            for(var p:node.path("participants")) {
                if("REQUESTER".equals(p.path("relationship").asText()) && uuid(p,"userId").equals(uuid(node.path("order"),"requesterId")))requesterPresent=true;
                if("HISTORICAL_COURIER".equals(p.path("relationship").asText()) && !node.path("order").path("courierId").isNull() && uuid(p,"userId").equals(uuid(node.path("order"),"courierId")))currentCourierPresent=true;
            }
            require(requesterPresent && currentCourierPresent);
            for(var cp:coverage.path("checkpoints")) require(cp.path("projectedSequence").asLong()>=cp.path("committedSequence").asLong());
            require(streams.stream().anyMatch(s->s.startsWith("order-service/order.lifecycle.events/"+orderId)));
            require(streams.stream().anyMatch(s->s.startsWith("credit-service/credit.events/"+orderId)));
            require(streams.stream().anyMatch(s->s.startsWith("admin-service/admin.events/"+caseId)));
        }
    }
    static int compare(JsonNode a,JsonNode b) {
        int c=Instant.parse(a.path("occurredAt").asText()).compareTo(Instant.parse(b.path("occurredAt").asText()));
        if(c==0)c=a.path("source").asText().compareTo(b.path("source").asText());
        if(c==0)c=Long.compare(a.path("sourceSequence").asLong(),b.path("sourceSequence").asLong());
        if(c==0)c=a.path("eventId").asText().compareTo(b.path("eventId").asText());
        return c;
    }
    // Unknown producer fields can be accepted without forwarding private notes or credentials.
    static JsonNode publicTimeline(JsonNode source) {
        var root=pick(source,"caseId","orderId","evidenceRevision","nextCursor");
        root.set("order",publicSnapshot(source.path("order")));
        var participants=JSON.createArrayNode();
        for(var p:source.path("participants"))participants.add(pick(p,"userId","relationship","assignedAt","unassignedAt"));root.set("participants",participants);
        var records=JSON.createArrayNode();
        for(var r:source.path("records")){
            var record=pick(r,"eventId","source","stream","sourceSequence","orderId","action","actorUserId","occurredAt","ingestedAt");
            var d=r.path("data");tools.jackson.databind.node.ObjectNode data;
            if("ORDER".equals(d.path("kind").asText())){data=pick(d,"kind","fromState","toState","requesterId","courierId","previousCourierId");data.set("snapshot",publicSnapshot(d.path("snapshot")));}
            else if("CREDIT".equals(d.path("kind").asText())){data=pick(d,"kind","operationId","reasonCode","result");var entries=JSON.createArrayNode();for(var e:d.path("ledgerEntries"))entries.add(pick(e,"ledgerEntryId","userId","availableDelta","reservedDelta","availableBalance","reservedBalance"));data.set("ledgerEntries",entries);}
            else if("CHAT".equals(d.path("kind").asText())){data=pick(d,"kind","caseId","conversationId","conversationType","participantUserId","messageId","messageType","text");data.set("attachment",d.path("attachment").isNull()?JSON.nullNode():pick(d.path("attachment"),"id","contentType","filename","size"));}
            else data=pick(d,"kind","caseId","operationId","targetUserId","result");
            record.set("data",data);records.add(record);
        }
        root.set("records",records);var coverage=pick(source.path("coverage"),"status","asOf");
        var checkpoints=JSON.createArrayNode();for(var p:source.path("coverage").path("checkpoints"))checkpoints.add(pick(p,"source","stream","aggregateId","committedSequence","projectedSequence","checkedAt"));coverage.set("checkpoints",checkpoints);
        var gaps=JSON.createArrayNode();for(var g:source.path("coverage").path("blockingGaps"))gaps.add(pick(g,"source","stream","aggregateId","fromSequence","toSequence","reason"));coverage.set("blockingGaps",gaps);root.set("coverage",coverage);return root;
    }
    private static tools.jackson.databind.node.ObjectNode publicSnapshot(JsonNode source){var result=pick(source,"orderId","requesterId","courierId","status","title","description","creditReward","pickupDeadline","pickupLocationId","dropoffLocationId","pickupLocationName","dropoffLocationName");result.put("pickupDeadline",java.time.OffsetDateTime.parse(source.path("pickupDeadline").asText()).toInstant().toString());return result;}
    private static tools.jackson.databind.node.ObjectNode pick(JsonNode source,String...fields){var target=JSON.createObjectNode();for(String field:fields)target.set(field,source.path(field));return target;}
    static void record(JsonNode r,UUID orderId) {
        uuid(r,"eventId"); text(r,"source"); text(r,"stream"); number(r,"sourceSequence"); equalUuid(r,"orderId",orderId);
        text(r,"action"); nullableUuid(r,"actorUserId"); time(r,"occurredAt"); time(r,"ingestedAt"); var d=r.path("data");
        choice(d,"kind",Set.of("ORDER","CREDIT","ADMIN","CHAT"));
        switch(d.path("kind").asText()) {
            case "ORDER" -> { nullableText(d,"fromState"); text(d,"toState"); uuid(d,"requesterId"); nullableUuid(d,"courierId"); nullableUuid(d,"previousCourierId"); snapshot(d.path("snapshot"),orderId); }
            case "CREDIT" -> {
                uuid(d,"operationId"); nullableText(d,"reasonCode"); choice(d,"result",Set.of("APPLIED","REJECTED","NO_CHANGE")); array(d,"ledgerEntries");
                for(var entry:d.path("ledgerEntries")){ uuid(entry,"ledgerEntryId"); uuid(entry,"userId"); integer(entry,"availableDelta"); integer(entry,"reservedDelta"); number(entry,"availableBalance"); number(entry,"reservedBalance"); }
            }
            case "ADMIN" -> { uuid(d,"caseId"); nullableUuid(d,"operationId"); nullableUuid(d,"targetUserId"); nullableText(d,"result"); if(!d.path("result").isNull()) choice(d,"result",Set.of("APPLIED","REJECTED","NO_CHANGE")); }
            case "CHAT" -> {
                uuid(d,"caseId"); uuid(d,"conversationId"); uuid(d,"messageId"); nullableUuid(d,"participantUserId");
                choice(d,"conversationType",Set.of("ERRAND","CASE"));require("CASE".equals(d.path("conversationType").asText())?!d.path("participantUserId").isNull():d.path("participantUserId").isNull());choice(d,"messageType",Set.of("TEXT","QUICK_REPLY","IMAGE"));
                require("chat-service".equals(r.path("source").asText()) && "chat.messages".equals(r.path("stream").asText()));
                require(uuid(r,"eventId").equals(uuid(d,"messageId")));uuid(r,"actorUserId");
                if("IMAGE".equals(d.path("messageType").asText())) {
                    require(d.path("text").isNull());var a=d.path("attachment");uuid(a,"id");choice(a,"contentType",Set.of("image/png","image/jpeg","image/webp"));text(a,"filename");number(a,"size");require(a.path("size").asLong()>0&&a.path("size").asLong()<=5242880);
                } else {require(d.path("attachment").isNull());require(d.path("text").isString()&&!d.path("text").asText().isBlank()&&d.path("text").asText().length()<=4000);}
            }
            default -> throw new IllegalArgumentException();
        }
    }
    static void snapshot(JsonNode s,UUID orderId) {
        equalUuid(s,"orderId",orderId); uuid(s,"requesterId"); nullableUuid(s,"courierId"); choice(s,"status",STATES);
        text(s,"title"); require(s.path("title").asText().length()<=120); text(s,"description"); number(s,"creditReward"); require(s.path("creditReward").asLong()>0);
        time(s,"pickupDeadline"); uuid(s,"pickupLocationId"); uuid(s,"dropoffLocationId"); nullableText(s,"pickupLocationName"); nullableText(s,"dropoffLocationName");
    }
    static void checkpoint(JsonNode cp){ text(cp,"source"); text(cp,"stream"); uuid(cp,"aggregateId"); number(cp,"committedSequence"); time(cp,"checkedAt"); }
    static void require(boolean valid){if(!valid)throw new IllegalArgumentException("Invalid evidence response");}
    static String text(JsonNode n,String key){var v=n.path(key); require(v.isString()&&!v.asText().isBlank()&&v.asText().length()<=2000);return v.asText();}
    static void nullableText(JsonNode n,String key){require(n.has(key));if(!n.path(key).isNull())text(n,key);}
    static UUID uuid(JsonNode n,String key){return UUID.fromString(text(n,key));}
    static void equalUuid(JsonNode n,String key,UUID expected){require(expected.equals(uuid(n,key)));}
    static void nullableUuid(JsonNode n,String key){require(n.has(key));if(!n.path(key).isNull())uuid(n,key);}
    static void time(JsonNode n,String key){java.time.OffsetDateTime.parse(text(n,key)).toInstant();}
    static void nullableTime(JsonNode n,String key){require(n.has(key));if(!n.path(key).isNull())time(n,key);}
    static void choice(JsonNode n,String key,Set<String> choices){require(choices.contains(text(n,key)));}
    static void integer(JsonNode n,String key){var v=n.path(key);require(v.isIntegralNumber()&&v.canConvertToLong());}
    static void number(JsonNode n,String key){integer(n,key);require(n.path(key).asLong()>=0);}
    static void array(JsonNode n,String key){require(n.path(key).isArray());}
}
