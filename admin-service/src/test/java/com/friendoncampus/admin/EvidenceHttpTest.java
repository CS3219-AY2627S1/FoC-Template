package com.friendoncampus.admin;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.friendoncampus.admin.EvidenceFixtures.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

@WebMvcTest(EvidenceController.class)
@Import({SecurityConfiguration.class,ApiProblems.class})
class EvidenceHttpTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.admin.authorization.CurrentAuthorization currentAuthorization;
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder userJwtDecoder;
    @MockitoBean ServiceTokens services;
    @MockitoBean TimelineService timelines;
    @MockitoBean EvidenceExportService exports;
    Jwt token(String role){return Jwt.withTokenValue("user").header("alg","RS256").subject(ACTOR.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();}
    @Test void timelineRequiresAdminAndPassesOriginalActorAndPagination() throws Exception {
        mvc.perform(get("/api/admin/cases/{id}/timeline",CASE)).andExpect(status().isUnauthorized());
        when(userJwtDecoder.decode("user")).thenReturn(token("REQUESTER"));
        mvc.perform(get("/api/admin/cases/{id}/timeline",CASE).header("Authorization","Bearer user")).andExpect(status().isForbidden());verifyNoInteractions(timelines);
        when(userJwtDecoder.decode("user")).thenReturn(token("ADMIN"));
        when(timelines.read(any(),eq(CASE),eq("opaque"),eq(10))).thenReturn(JsonMapper.builder().build().valueToTree(timeline()));
        mvc.perform(get("/api/admin/cases/{id}/timeline",CASE).param("cursor","opaque").param("limit","10").header("Authorization","Bearer user")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.caseId").value(CASE.toString()));
    }
    @Test void exportRequiresPinnedChatServiceAndCaseScope() throws Exception {
        when(services.decode(eq("user"),any())).thenThrow(new BadJwtException("Not a service token"));
        mvc.perform(get("/internal/admin/orders/{id}/evidence",ORDER).param("caseId",CASE.toString()).header("Authorization","Bearer user")).andExpect(status().isUnauthorized());verifyNoInteractions(exports);
        when(services.decode(eq("chat"),eq(Set.of("chat-service")))).thenReturn(token("ADMIN"));
        when(exports.read(ORDER,CASE,null,20)).thenReturn(new EvidenceExportService.Export(ORDER,"snapshot",new EvidenceExportService.Checkpoint("admin-service","admin.events",CASE,1,Instant.now()),List.of(),null));
        mvc.perform(get("/internal/admin/orders/{id}/evidence",ORDER).param("caseId",CASE.toString()).header("Authorization","Bearer chat")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.checkpoint.projectedSequence").doesNotExist());
        mvc.perform(get("/internal/admin/orders/{id}/evidence",ORDER).header("Authorization","Bearer chat")).andExpect(status().isBadRequest());
        verify(services,atLeastOnce()).decode("chat",Set.of("chat-service"));
    }
}
