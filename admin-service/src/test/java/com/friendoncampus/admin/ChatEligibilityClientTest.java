package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class ChatEligibilityClientTest {
    HttpServer server;
    ChatEligibilityClient client;
    UUID order=UUID.randomUUID(), actor=UUID.randomUUID();
    Map<String,Object> response;
    Map<String,Object> checkpoint;
    Map<String,Object> coverage;
    int status=200;
    String authorization, actorToken, path;
    @BeforeEach void setup() throws Exception {
        var tokens=mock(ServiceTokens.class); when(tokens.issue("chat-service")).thenReturn("service-assertion");
        checkpoint=new LinkedHashMap<>(Map.of("source","order-service","stream","order.lifecycle.events","aggregateId",order.toString(),"committedSequence",7,"projectedSequence",7,"checkedAt",Instant.now().toString()));
        coverage=new LinkedHashMap<>(Map.of("status","COMPLETE","asOf",Instant.now().toString(),"blockingGaps",List.of(),"checkpoints",List.of(checkpoint)));
        response=new LinkedHashMap<>(Map.of("orderId",order.toString(),"userId",actor.toString(),"eligible",true,"evidenceRevision","eligibility-1","coverage",coverage));
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            authorization=exchange.getRequestHeaders().getFirst("Authorization"); actorToken=exchange.getRequestHeaders().getFirst("X-Actor-Token"); path=exchange.getRequestURI().toString();
            byte[] bytes=JsonMapper.builder().build().writeValueAsString(response).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json"); exchange.sendResponseHeaders(status,bytes.length);
            try(var out=exchange.getResponseBody()){out.write(bytes);}
        }); server.start();
        client=new ChatEligibilityClient(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),tokens);
    }
    @AfterEach void close(){server.stop(0);}
    @Test void delegatesOriginalIdentityAndAcceptsExplicitCompleteCoverage() {
        var result=client.check(order,actor,"original-user-jwt"); assertTrue(result.eligible()); assertTrue(result.complete());
        assertEquals("Bearer service-assertion",authorization); assertEquals("original-user-jwt",actorToken);
        assertEquals("/internal/chat/orders/"+order+"/report-eligibility?userId="+actor,path);
        response.put("eligible",false); assertFalse(client.check(order,actor,"user").eligible());
    }
    @Test void neverTreatsLagEmptyCoverageGapsOrUnknownAsComplete() {
        checkpoint.put("projectedSequence",6); assertFalse(client.check(order,actor,"user").complete());
        checkpoint.put("projectedSequence",7.5); assertFalse(client.check(order,actor,"user").complete());
        checkpoint.put("projectedSequence",7); coverage.put("blockingGaps",List.of(Map.of("reason","MISSING_SEQUENCE")));
        assertFalse(client.check(order,actor,"user").complete());
        coverage.put("blockingGaps",List.of()); coverage.put("checkpoints",List.of()); assertFalse(client.check(order,actor,"user").complete());
        coverage.put("checkpoints",List.of(checkpoint)); coverage.put("status","UNKNOWN"); assertFalse(client.check(order,actor,"user").complete());
    }
    @Test void mismatchedIdentityMalformedCoverageAndHttpFailuresFailClosed() {
        response.put("userId",UUID.randomUUID().toString()); unavailable(); response.put("userId",actor.toString());
        response.put("orderId",UUID.randomUUID().toString()); unavailable(); response.put("orderId",order.toString());
        coverage.put("asOf","bad-date"); unavailable(); coverage.put("asOf",Instant.now().toString());
        checkpoint.remove("checkedAt"); unavailable(); checkpoint.put("checkedAt",Instant.now().toString());
        response.put("eligible","true"); unavailable(); response.put("eligible",true);
        status=503; unavailable(); status=403; unavailable(); status=302; unavailable();
    }
    private void unavailable(){assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->client.check(order,actor,"user")).getStatusCode());}
    @Test void requiresTheRequestedOrdersActualLifecycleCheckpointWithoutDuplicateClaims() {
        checkpoint.put("aggregateId",UUID.randomUUID().toString());assertFalse(client.check(order,actor,"user").complete());
        checkpoint.put("aggregateId",order.toString());checkpoint.put("source","credit-service");assertFalse(client.check(order,actor,"user").complete());
        checkpoint.put("source","order-service");checkpoint.put("stream","other-stream");assertFalse(client.check(order,actor,"user").complete());
        checkpoint.put("stream","order.lifecycle.events");coverage.put("checkpoints",List.of(checkpoint,checkpoint));assertFalse(client.check(order,actor,"user").complete());
        coverage.put("checkpoints",List.of(checkpoint));assertTrue(client.check(order,actor,"user").complete());
    }
}
