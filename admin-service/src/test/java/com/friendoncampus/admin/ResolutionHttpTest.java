package com.friendoncampus.admin;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ResolutionController.class)
@Import({SecurityConfiguration.class,ApiProblems.class})
class ResolutionHttpTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.admin.authorization.CurrentAuthorization currentAuthorization;
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder userJwtDecoder;
    @MockitoBean ServiceTokens tokens;
    @MockitoBean ResolutionService resolutions;
    UUID id=UUID.randomUUID(),key=UUID.randomUUID(),actor=UUID.randomUUID();
    void role(String role){when(userJwtDecoder.decode("user")).thenReturn(Jwt.withTokenValue("user").header("alg","RS256").subject(actor.toString()).claim("role",role).build());}
    @Test void onlyAdminMayResolveAndRequiredInputsAreValidated() throws Exception {
        mvc.perform(post("/api/admin/cases/{id}/resolve",id)).andExpect(status().isUnauthorized());
        role("REQUESTER");mvc.perform(post("/api/admin/cases/{id}/resolve",id).header("Authorization","Bearer user").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        role("ADMIN");mvc.perform(post("/api/admin/cases/{id}/resolve",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"resolution\":\"Reason\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(resolutions);
    }
    @Test void delegatesResolutionAndReturnsTheStoredNonCacheableDecision() throws Exception {
        role("ADMIN");when(resolutions.resolve(any(),eq(id),eq(key),eq("Reason"),eq(2L),isNull())).thenReturn(new CaseViews.Mutation(200,"{\"case\":{\"state\":\"RESOLVED\"}}"));
        mvc.perform(post("/api/admin/cases/{id}/resolve",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"resolution\":\"Reason\",\"expectedRevision\":2}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.case.state").value("RESOLVED"));
    }
}
