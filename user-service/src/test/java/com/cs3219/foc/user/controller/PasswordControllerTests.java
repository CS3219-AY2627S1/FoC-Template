package com.cs3219.foc.user.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.user.exception.InvalidPasswordException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.model.dto.ChangePasswordRequest;
import com.cs3219.foc.user.service.PasswordService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringJUnitWebConfig(UserControllerTests.TestConfig.class)
class PasswordControllerTests {
    @Autowired
    private WebApplicationContext context;

    @Autowired
    private PasswordService service;

    @Autowired
    private JwtDecoder decoder;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private static final String BODY = """
            {"currentPassword":"CurrentPassword1","newPassword":"NewPassword2"}
            """;

    @BeforeEach
    void setUp() {
        reset(service, decoder);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    @Test
    void changesOnlyJwtUsersPasswordAndClearsCookie() throws Exception {
        mvc.perform(put("/users/me/password")
                        .param("userId", UUID.randomUUID().toString())
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""))
                .andExpect(cookie().value("refreshToken", ""))
                .andExpect(cookie().maxAge("refreshToken", 0))
                .andExpect(cookie().path("refreshToken", "/api/auth"))
                .andExpect(cookie().httpOnly("refreshToken", true))
                .andExpect(cookie().secure("refreshToken", true));
        verify(service).changePassword(new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(put("/users/me/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsInvalidToken() throws Exception {
        when(decoder.decode("invalid")).thenThrow(new BadJwtException("Invalid token"));
        mvc.perform(put("/users/me/password")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer invalid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{}",
                "{\"newPassword\":\"NewPassword2\"}",
                "{\"currentPassword\":null,\"newPassword\":\"NewPassword2\"}",
                "{\"currentPassword\":\"   \",\"newPassword\":\"NewPassword2\"}"
            })
    void rejectsMissingCurrentPassword(String body) throws Exception {
        invalid(body, "currentPassword");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"currentPassword\":\"CurrentPassword1\"}",
                "{\"currentPassword\":\"CurrentPassword1\",\"newPassword\":null}",
                "{\"currentPassword\":\"CurrentPassword1\",\"newPassword\":\"        \"}",
                "{\"currentPassword\":\"CurrentPassword1\",\"newPassword\":\"short\"}"
            })
    void rejectsInvalidNewPassword(String body) throws Exception {
        invalid(body, "newPassword");
    }

    @ParameterizedTest
    @ValueSource(strings = {"currentPassword", "newPassword"})
    void rejectsPasswordsBeyondUtf8ByteLimit(String field) throws Exception {
        // Unicode escape for an accented e: 37 characters use 74 bytes, exceeding the 72-byte limit.
        for (var password : new String[] {"a".repeat(73), "\u00e9".repeat(37)}) {
            var body = BODY.replace(field.equals("currentPassword") ? "CurrentPassword1" : "NewPassword2", password);
            invalid(body, field);
        }
    }

    @Test
    void acceptsPasswordsAtUtf8ByteLimit() throws Exception {
        // Each accented e uses two UTF-8 bytes: 36 characters reach the 72-byte limit.
        var password = "\u00e9".repeat(36);
        mvc.perform(put("/users/me/password")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                BODY.replace("CurrentPassword1", "a".repeat(72)).replace("NewPassword2", password)))
                .andExpect(status().isNoContent());
        verify(service).changePassword(new ChangePasswordRequest("a".repeat(72), password));
    }

    @Test
    void reportsIncorrectPasswordWithoutClearingCookie() throws Exception {
        doThrow(new InvalidPasswordException("currentPassword", "Current password is incorrect"))
                .when(service)
                .changePassword(any());
        mvc.perform(put("/users/me/password")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.currentPassword").value("Current password is incorrect"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }

    @Test
    void returnsNotFoundForDeletedAccount() throws Exception {
        doThrow(new UserNotFoundException("User not found")).when(service).changePassword(any());
        mvc.perform(put("/users/me/password")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isNotFound());
    }

    private void invalid(String body, String field) throws Exception {
        mvc.perform(put("/users/me/password")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors." + field).exists())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        verifyNoInteractions(service);
    }
}
