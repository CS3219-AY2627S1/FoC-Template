package com.friendoncampus.admin;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(AdminController.class)
@Import({SecurityConfiguration.class, ApiProblems.class})
class AdminSecurityTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.admin.authorization.CurrentAuthorization currentAuthorization;
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder userJwtDecoder;
    @MockitoBean UserEligibilityClient users;
    @MockitoBean CaseAccessService access;
    @MockitoBean ServiceTokens services;
    final UUID userId = UUID.randomUUID();
    Jwt token(String role) { return Jwt.withTokenValue("user").header("alg", "RS256").subject(userId.toString())
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).claim("role", role).build(); }
    @Test void anonymousAndParticipantCannotReadAdminSession() throws Exception {
        mvc.perform(get("/api/admin/session")).andExpect(status().isUnauthorized());
        when(userJwtDecoder.decode("user")).thenReturn(token("REQUESTER"));
        mvc.perform(get("/api/admin/session").header("Authorization", "Bearer user")).andExpect(status().isForbidden());
        verifyNoInteractions(users);
    }
    @Test void checksPersistedEligibilityAndFailsClosedOnRevocationOrOutage() throws Exception {
        when(userJwtDecoder.decode("user")).thenReturn(token("ADMIN"));
        when(users.find(userId)).thenReturn(new UserEligibilityClient.Eligibility(userId, true, true));
        mvc.perform(get("/api/admin/session").header("Authorization", "Bearer user")).andExpect(status().isOk()).andExpect(jsonPath("$.userId").value(userId.toString()));
        when(users.find(userId)).thenReturn(new UserEligibilityClient.Eligibility(userId, true, false));
        mvc.perform(get("/api/admin/session").header("Authorization", "Bearer user")).andExpect(status().isForbidden());
        when(users.find(userId)).thenReturn(new UserEligibilityClient.Eligibility(userId, false, true));
        mvc.perform(get("/api/admin/session").header("Authorization", "Bearer user")).andExpect(status().isForbidden());
        when(users.find(userId)).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        mvc.perform(get("/api/admin/session").header("Authorization", "Bearer user")).andExpect(status().isServiceUnavailable());
    }
    @Test void userBearerCannotAuthenticateAsChatAndUnknownRoutesAreDenied() throws Exception {
        when(services.decode(eq("user"), any())).thenThrow(new BadJwtException("wrong issuer"));
        mvc.perform(get("/internal/admin/cases/{id}/access", UUID.randomUUID()).param("actorId",userId.toString())
                .header("Authorization","Bearer user")).andExpect(status().isUnauthorized());
        verifyNoInteractions(access);
        when(userJwtDecoder.decode("user")).thenReturn(token("ADMIN"));
        mvc.perform(get("/api/admin/not-published").header("Authorization","Bearer user")).andExpect(status().isForbidden());
    }
    @Test void keyDiscoveryOutageIsUnavailableRatherThanInvalidIdentity() throws Exception {
        when(userJwtDecoder.decode("user")).thenThrow(new JwtException("Key discovery unavailable"));
        mvc.perform(get("/api/admin/session").header("Authorization","Bearer user"))
                .andExpect(status().isServiceUnavailable());
    }
}
