package com.friendoncampus.admin;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CreditActionController.class)
@Import({SecurityConfiguration.class,ApiProblems.class})
class CreditActionHttpTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.admin.authorization.CurrentAuthorization currentAuthorization;
    @Autowired MockMvc mvc;@MockitoBean JwtDecoder userJwtDecoder;@MockitoBean ServiceTokens tokens;@MockitoBean CreditActionService actions;
    UUID id=UUID.randomUUID(),key=UUID.randomUUID(),target=UUID.randomUUID();
    void role(String role){when(userJwtDecoder.decode("user")).thenReturn(Jwt.withTokenValue("user").header("alg","RS256").subject(target.toString()).claim("role",role).build());}
    @Test void onlyAdminCanRequestOrReadActions()throws Exception{
        mvc.perform(get("/api/admin/cases/{id}/actions/{op}",id,key)).andExpect(status().isUnauthorized());role("REQUESTER");
        mvc.perform(get("/api/admin/cases/{id}/actions/{op}",id,key).header("Authorization","Bearer user")).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/cases/{id}/actions",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{}")).andExpect(status().isForbidden());verifyNoInteractions(actions);
    }
    @Test void validatesRequiredFieldsAndReturnsAcceptedWithoutClaimingSuccess()throws Exception{
        role("ADMIN");mvc.perform(post("/api/admin/cases/{id}/actions",id).header("Authorization","Bearer user").contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        when(actions.create(any(),eq(id),eq(key),eq("CREDIT_ADJUSTMENT"),eq(target),any(),eq("Reason"))).thenReturn(new CaseViews.Mutation(202,"{\"status\":\"PENDING\"}"));
        mvc.perform(post("/api/admin/cases/{id}/actions",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"type\":\"CREDIT_ADJUSTMENT\",\"targetUserId\":\""+target+"\",\"amount\":-5,\"reason\":\"Reason\"}")).andExpect(status().isAccepted()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.status").value("PENDING"));
    }
}
