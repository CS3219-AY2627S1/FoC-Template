package com.friendoncampus.admin;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CaseController.class)
@Import({SecurityConfiguration.class,ApiProblems.class})
class CaseHttpTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.admin.authorization.CurrentAuthorization currentAuthorization;
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder userJwtDecoder;
    @MockitoBean ServiceTokens services;
    @MockitoBean CaseService cases;
    UUID actor=UUID.randomUUID(), id=UUID.randomUUID(), order=UUID.randomUUID(), key=UUID.randomUUID();
    @Test void confirmedConversationDiscoverySeparatesRolesAndDisablesCaching() throws Exception {
        mvc.perform(get("/api/admin/reports/{id}/conversations",id)).andExpect(status().isUnauthorized());
        role("REQUESTER");
        mvc.perform(get("/api/admin/cases/{id}/conversations",id).header("Authorization","Bearer user")).andExpect(status().isForbidden());
        var reference=new ChatConversationClient.Conversation(key,id,order,actor,true);
        when(cases.confirmedConversations(any(),eq(id),eq(true))).thenReturn(List.of(reference));
        mvc.perform(get("/api/admin/reports/{id}/conversations",id).header("Authorization","Bearer user"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$[0].participantUserId").value(actor.toString())).andExpect(jsonPath("$[0].readOnly").value(true));
        role("ADMIN");
        mvc.perform(get("/api/admin/reports/{id}/conversations",id).header("Authorization","Bearer user")).andExpect(status().isForbidden());
        when(cases.confirmedConversations(any(),eq(id),eq(false))).thenReturn(List.of());
        mvc.perform(get("/api/admin/cases/{id}/conversations",id).header("Authorization","Bearer user"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(content().json("[]"));
    }
    void role(String role){when(userJwtDecoder.decode("user")).thenReturn(Jwt.withTokenValue("user").header("alg","RS256").subject(actor.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build());}
    @Test void reportContextRequiresParticipantModeAndIsNotCacheable() throws Exception {
        mvc.perform(get("/api/admin/orders/{id}/report-context",order)).andExpect(status().isUnauthorized());
        role("ADMIN");mvc.perform(get("/api/admin/orders/{id}/report-context",order).header("Authorization","Bearer user")).andExpect(status().isForbidden());
        role("COURIER");when(cases.reportContext(any(),eq(order))).thenReturn(new CaseService.ReportContext(order,"INELIGIBLE",null,null));
        mvc.perform(get("/api/admin/orders/{id}/report-context",order).header("Authorization","Bearer user")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.status").value("INELIGIBLE")).andExpect(jsonPath("$.caseId").isEmpty());
    }
    @Test void conversationInitiationRequiresAdminValidTargetAndRequestKey() throws Exception {
        role("REQUESTER");
        mvc.perform(post("/api/admin/cases/{id}/conversations",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"participantUserId\":\""+actor+"\"}")).andExpect(status().isForbidden());
        role("ADMIN");
        mvc.perform(post("/api/admin/cases/{id}/conversations",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        when(cases.openConversation(any(),eq(key),eq(id),eq(actor))).thenReturn(new CaseViews.Mutation(200,"{\"conversationId\":\""+order+"\"}"));
        mvc.perform(post("/api/admin/cases/{id}/conversations",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"participantUserId\":\""+actor+"\"}")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
    }
    @Test void separatesParticipantAndAdministratorRoutes() throws Exception {
        mvc.perform(get("/api/admin/cases")).andExpect(status().isUnauthorized()); role("REQUESTER");
        mvc.perform(get("/api/admin/cases").header("Authorization","Bearer user")).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":1}")).andExpect(status().isForbidden());
        role("ADMIN");
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"orderId\":\""+order+"\",\"description\":\"Issue\"}")).andExpect(status().isForbidden());
        verifyNoInteractions(cases);
    }
    @Test void validatesHeadersBodiesAndUuidFiltersBeforeService() throws Exception {
        role("REQUESTER");
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"orderId\":\""+order+"\",\"description\":\" \"}")).andExpect(status().isBadRequest());
        role("ADMIN");
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":-1}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/cases?query=invalid").header("Authorization","Bearer user")).andExpect(status().isBadRequest());
        verifyNoInteractions(cases);
    }
    @Test void rendersExactPrivateWireShapeAndMutationProblemStatus() throws Exception {
        var summary=new CaseViews.Summary(id,order,AdminCase.State.OPEN,null,1,Instant.now());
        role("REQUESTER"); when(cases.reportStatus(any(),eq(id))).thenReturn(new CaseViews.ParticipantReport(summary,new CaseViews.Statement(actor,"Private statement",Instant.now())));
        mvc.perform(get("/api/admin/reports/{id}",id).header("Authorization","Bearer user")).andExpect(status().isOk()).andExpect(jsonPath("$.case.caseId").value(id.toString())).andExpect(jsonPath("$.caseSummary").doesNotExist()).andExpect(jsonPath("$.statements").doesNotExist()).andExpect(jsonPath("$.ownStatement.description").value("Private statement"));
        role("ADMIN"); when(cases.claim(any(),eq(key),eq(id),eq(1L))).thenReturn(new CaseViews.Mutation(409,"{\"title\":\"Conflict\",\"status\":409}"));
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":1}")).andExpect(status().isConflict()).andExpect(content().contentType("application/problem+json")).andExpect(header().string("Cache-Control","no-store"));
    }
}
