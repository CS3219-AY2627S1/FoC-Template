package com.friendoncampus.user.web;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.service.InvalidCredentialsException;
import com.friendoncampus.user.service.EmailVerificationRequiredException;
import com.friendoncampus.user.service.JwtTokenService;
import com.friendoncampus.user.service.LoginService;

@WebMvcTest(LoginController.class)
@AutoConfigureMockMvc(addFilters = false)
class LoginControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean LoginService loginService;

    @Test
    void returnsA15MinuteBearerTokenForValidLogin() throws Exception {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        Instant expiry = Instant.parse("2030-01-01T00:15:00Z");
        when(loginService.login(anyString(), anyString()))
                .thenReturn(new LoginService.LoginResult(user, UserRole.REQUESTER, new JwtTokenService.IssuedToken("signed.jwt", expiry)));

        mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("signed.jwt"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresAt").value("2030-01-01T00:15:00Z"))
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andExpect(jsonPath("$.username").value("Alice"))
                .andExpect(jsonPath("$.role").value("REQUESTER"))
                .andExpect(jsonPath("$.availableRoles[0]").value("REQUESTER"));
    }

    @Test
    void returnsTheSameGenericUnauthorizedResponseForBadCredentials() throws Exception {
        when(loginService.login(anyString(), anyString())).thenThrow(new InvalidCredentialsException());

        mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"missing@u.nus.edu\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.title").value("Authentication failed"))
                .andExpect(jsonPath("$.detail").value("Incorrect email or password"));
    }

    @Test
    void reportsVerificationRequiredOnlyAfterTheLoginServiceAcceptedCredentials() throws Exception {
        when(loginService.login(anyString(), anyString())).thenThrow(new EmailVerificationRequiredException());

        mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"password\":\"correct-password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Email verification required"))
                .andExpect(jsonPath("$.detail").value("Email verification is required before signing in"))
                .andExpect(jsonPath("$.code").value("EMAIL_VERIFICATION_REQUIRED"));
    }
}
