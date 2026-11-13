package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class ChatConversationClientTest {
    HttpServer server; ChatConversationClient client;
    final UUID caseId=UUID.randomUUID(),order=UUID.randomUUID(),participant=UUID.randomUUID(),id=UUID.randomUUID(),key=UUID.randomUUID();
    int status=200;Map<String,Object> response;String service,actor,requestKey,path,requestBody,method;
    @BeforeEach void setup() throws Exception {
        response=new LinkedHashMap<>(Map.of("conversationId",id,"caseId",caseId,"orderId",order,"participantUserId",participant,"readOnly",false));
        var tokens=mock(ServiceTokens.class);when(tokens.issue("chat-service")).thenReturn("service-token");
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",e->{service=e.getRequestHeaders().getFirst("Authorization");actor=e.getRequestHeaders().getFirst("X-Actor-Token");requestKey=e.getRequestHeaders().getFirst("Idempotency-Key");path=e.getRequestURI().toString();method=e.getRequestMethod();requestBody=new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);byte[] bytes=JsonMapper.builder().build().writeValueAsBytes(response);e.sendResponseHeaders(status,bytes.length);try(var out=e.getResponseBody()){out.write(bytes);}});server.start();
        client=new ChatConversationClient(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),tokens);
    }
    @AfterEach void stop(){server.stop(0);}
    @Test void forwardsOnlyDocumentedBodyAndOriginalOperationIdentity(){
        response.put("privateNote","must not leak");
        var result=client.open(caseId,order,participant,key,"actor-jwt");
        assertEquals(id,result.conversationId());assertFalse(result.readOnly());assertEquals("POST",method);
        assertEquals("/internal/chat/cases/"+caseId+"/conversations",path);assertEquals("Bearer service-token",service);assertEquals("actor-jwt",actor);assertEquals(key.toString(),requestKey);
        assertEquals(Map.of("participantUserId",participant.toString()),JsonMapper.builder().build().readValue(requestBody,Map.class));
    }
    @Test void validatesScopeAndReadOnlyInsteadOfTrustingAResponse(){
        response.put("readOnly",true);assertTrue(client.open(caseId,order,participant,key,"actor").readOnly());
        for(String field:List.of("caseId","orderId","participantUserId")) {Object original=response.put(field,UUID.randomUUID());assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->client.open(caseId,order,participant,key,"actor")).getStatusCode());response.put(field,original);}
        response.remove("readOnly");assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->client.open(caseId,order,participant,key,"actor")).getStatusCode());
    }
    @Test void doesNotFollowRedirectsOrTurnFailuresIntoEmptyConversations(){
        for(int code:List.of(401,403,404,409,302,500,503)) {
            status=code;var actual=assertThrows(ResponseStatusException.class,()->client.open(caseId,order,participant,key,"actor"));
            assertEquals(Set.of(401,403,404,409).contains(code)?HttpStatus.valueOf(code):HttpStatus.SERVICE_UNAVAILABLE,actual.getStatusCode());
        }
    }
}
