package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.friendoncampus.admin.EvidenceFixtures.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class ChatTimelineClientTest {
    HttpServer server;ChatTimelineClient client;Map<String,Object> response;int status=200;String serviceHeader,actorHeader,path;
    @BeforeEach void setup() throws Exception {
        response=timeline();var tokens=mock(ServiceTokens.class);when(tokens.issue("chat-service")).thenReturn("service-assertion");
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{serviceHeader=exchange.getRequestHeaders().getFirst("Authorization");actorHeader=exchange.getRequestHeaders().getFirst("X-Actor-Token");path=exchange.getRequestURI().toString();byte[] bytes=serialize(response).getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(status,bytes.length);try(var out=exchange.getResponseBody()){out.write(bytes);}});server.start();
        client=new ChatTimelineClient(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),tokens);
    }
    @AfterEach void close(){server.stop(0);}
    @Test void delegatesIdentityEncodesCursorAndPreservesCoverage(){
        response.put("privateNote","must-not-leak");
        var data=client.fetch(CASE,ORDER,"original-jwt","opaque+/=cursor",20);
        assertFalse(data.has("privateNote"));
        assertEquals("Bearer service-assertion",serviceHeader);assertEquals("original-jwt",actorHeader);assertTrue(path.contains("cursor=opaque%2B%2F%3Dcursor"));assertEquals("COMPLETE",data.path("coverage").path("status").asText());
    }
    @SuppressWarnings("unchecked") Map<String,Object> coverage(){return (Map<String,Object>)response.get("coverage");}
    @SuppressWarnings("unchecked") @Test void acceptsOriginalOrderMinutePrecisionAndPublishesCanonicalDeadline(){
        ((Map<String,Object>)response.get("order")).put("pickupDeadline","2026-11-09T10:00Z");
        var result=client.fetch(CASE,ORDER,"user",null,20);
        assertEquals("2026-11-09T10:00:00Z",result.path("order").path("pickupDeadline").asText());
        ((Map<String,Object>)response.get("order")).put("pickupDeadline","2026-11-09T10:00");
        unavailable(); // Offset-free local times remain invalid evidence.
    }
    @Test void incompleteAndUnknownAreReturnedWithoutInventingCompleteness(){
        coverage().put("status","INCOMPLETE");coverage().put("blockingGaps",List.of(Map.of("source","order-service","stream","order.lifecycle.events","aggregateId",ORDER,"fromSequence",1,"toSequence",2,"reason","MISSING_SEQUENCE")));
        assertEquals("INCOMPLETE",client.fetch(CASE,ORDER,"user",null,20).path("coverage").path("status").asText());
        coverage().put("status","UNKNOWN");coverage().put("checkpoints",List.of());assertEquals("UNKNOWN",client.fetch(CASE,ORDER,"user",null,20).path("coverage").path("status").asText());
    }
    @SuppressWarnings("unchecked") @Test void rejectsContradictoryCompleteCoverageAndWrongCase(){
        var checkpoints=(List<Map<String,Object>>)coverage().get("checkpoints");checkpoints.get(0).put("projectedSequence",0);unavailable();
        checkpoints.get(0).put("projectedSequence",1);coverage().put("checkpoints",List.of());unavailable();
        response=timeline();response.put("caseId",UUID.randomUUID());unavailable();response=timeline();response.put("orderId",UUID.randomUUID());unavailable();
        response=timeline();response.remove("participants");unavailable();response=timeline();coverage().put("asOf","invalid");unavailable();
        response=timeline();response.put("participants",List.of());unavailable();
    }
    @Test void mapsExpiredSnapshotsSeparatelyAndFailsClosedForOtherHttpErrors(){
        status=409;assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->client.fetch(CASE,ORDER,"user","cursor",20)).getStatusCode());
        for(int code:List.of(401,403,404,302,500,503)){status=code;unavailable();}
    }
    private void unavailable(){assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->client.fetch(CASE,ORDER,"user",null,20)).getStatusCode());}
    @Test void mergedChatRecordWithoutStreamRemainsInvalidEvidence() {
        // AdminChatContractService.Record.wire currently omits stream. Keep the contract guard;
        // accepting a producer's malformed timeline would hide a producer integration gap.
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("kind","ADMIN");data.put("caseId",CASE);data.put("operationId",null);data.put("targetUserId",null);data.put("result",null);
        Map<String,Object> record=new LinkedHashMap<>(Map.of("eventId",UUID.randomUUID(),"source","admin-service","stream","admin.events",
                "sourceSequence",1,"orderId",ORDER,"action","CaseOpened","occurredAt",TIME,"ingestedAt",TIME,"data",data));
        record.put("actorUserId",ACTOR);response.put("records",List.of(record));
        assertEquals(1,client.fetch(CASE,ORDER,"user",null,20).path("records").size());
        record.remove("stream");
        unavailable();
    }
}
