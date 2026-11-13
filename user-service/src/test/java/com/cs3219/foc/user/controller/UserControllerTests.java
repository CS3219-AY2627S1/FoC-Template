package com.cs3219.foc.user.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.user.config.AuthProperties;
import com.cs3219.foc.user.config.SecurityConfig;
import com.cs3219.foc.user.exception.EmailRateLimitException;
import com.cs3219.foc.user.exception.GlobalExceptionHandler;
import com.cs3219.foc.user.exception.InvalidEmailTokenException;
import com.cs3219.foc.user.exception.InvalidPasswordResetTokenException;
import com.cs3219.foc.user.exception.UnsupportedEmailDomainException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UserBriefDto;
import com.cs3219.foc.user.model.dto.UserDto;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.security.JsonAccessDeniedHandler;
import com.cs3219.foc.user.security.JsonAuthenticationEntryPoint;
import com.cs3219.foc.user.service.AuthCookieFactory;
import com.cs3219.foc.user.service.AuthService;
import com.cs3219.foc.user.service.AvatarService;
import com.cs3219.foc.user.service.EmailChangeService;
import com.cs3219.foc.user.service.EmailVerificationService;
import com.cs3219.foc.user.service.PasswordService;
import com.cs3219.foc.user.service.UserService;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;

@SpringJUnitWebConfig(UserControllerTests.TestConfig.class)
class UserControllerTests {
    @Autowired
    private WebApplicationContext context;

    @Autowired
    private UserService service;

    @Autowired
    private EmailVerificationService verification;

    @Autowired
    private EmailChangeService emailChangeService;

    @Autowired
    private PasswordService passwordService;

    @Autowired
    private JwtDecoder decoder;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private UserProfileDto profile;

    @BeforeEach
    void setUp() {
        reset(service, decoder, verification, emailChangeService, passwordService);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
        profile = new UserProfileDto(
                userId.toString(),
                "alex@example.com",
                "Alex Tan",
                List.of("USER"),
                "+6591235436",
                "School of Computing",
                null);
    }

    @Test
    void passwordResetEndpointsArePublicAndValidateNewPasswords() throws Exception {
        mvc.perform(post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"email":" JAMIE@U.NUS.EDU "}
                        """))
                .andExpect(status().isNoContent());
        verify(passwordService).requestPasswordReset("jamie@u.nus.edu");
        mvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"token":"reset-token","newPassword":"short"}
                        """))
                .andExpect(status().isBadRequest());
        verify(passwordService, never()).resetPassword(any(), any());
        mvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"token":"reset-token","newPassword":" NewPassword2 "}
                        """))
                .andExpect(status().isNoContent());
        verify(passwordService).resetPassword("reset-token", " NewPassword2 ");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "{", "{\"email\":[]}"})
    void reportsUnreadableRequests(String body) throws Exception {
        mvc.perform(post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Request body is missing or contains invalid fields"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
        verifyNoInteractions(passwordService);
    }

    @Test
    void reportsQueryParameterValidationErrors() throws Exception {
        var ids = Collections.nCopies(201, userId.toString()).toArray(String[]::new);
        mvc.perform(get("/users/brief").param("ids", ids).with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors.ids").exists());
        verifyNoInteractions(service);
    }

    @Test
    void reportsMissingQueryParameters() throws Exception {
        mvc.perform(get("/users/brief").with(jwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors.ids").value("must be provided"));
        verifyNoInteractions(service);
    }

    @Test
    @WithMockUser
    void userBriefRequiresLoginAndReturnsOnlyBasicFields() throws Exception {
        when(service.getUserBriefs(List.of(userId))).thenReturn(List.of(new UserBriefDto(userId, "Alex Tan")));
        mvc.perform(get("/users/brief")
                        .param("ids", userId.toString())
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(userId.toString()))
                .andExpect(jsonPath("$[0].name").value("Alex Tan"))
                .andExpect(jsonPath("$[0].email").doesNotExist())
                .andExpect(jsonPath("$[0].roles").doesNotExist());
        mvc.perform(get("/users/brief")
                        .param("ids", "not-a-uuid")
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void emailTokenFailuresKeepTheirHttpResponses() throws Exception {
        doThrow(new EmailRateLimitException()).when(verification).resendRegistrationVerification("jamie@u.nus.edu");
        mvc.perform(post("/auth/email-verification/resend")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"jamie@u.nus.edu\"}"))
                .andExpect(status().isTooManyRequests());
        doThrow(new InvalidEmailTokenException()).when(emailChangeService).confirmChange("invalid");
        mvc.perform(post("/users/email-change/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"invalid\"}"))
                .andExpect(status().isBadRequest());
        doThrow(new InvalidPasswordResetTokenException())
                .when(passwordService)
                .resetPassword("invalid", "NewPassword2");
        mvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"invalid\",\"newPassword\":\"NewPassword2\"}"))
                .andExpect(status().isGone());
    }

    @Test
    void readsOnlyAuthenticatedUsersProfile() throws Exception {
        when(service.getUserProfile()).thenReturn(profile);
        mvc.perform(get("/users/me")
                        .param("userId", UUID.randomUUID().toString())
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.name").value("Alex Tan"))
                .andExpect(jsonPath("$.phoneNumber").value("+6591235436"))
                .andExpect(jsonPath("$.faculty").value("School of Computing"))
                .andExpect(jsonPath("$.roles[0]").value("USER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.refreshToken").doesNotExist());
        verify(service).getUserProfile();
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminCanReadAnotherUserProfile() throws Exception {
        var adminUser = new UserDto(
                userId.toString(),
                profile.email(),
                profile.name(),
                profile.roles(),
                profile.phoneNumber(),
                profile.faculty(),
                null,
                OffsetDateTime.parse("2026-01-01T00:00:00Z"),
                OffsetDateTime.parse("2026-01-02T00:00:00Z"));
        when(service.getUserDto(userId)).thenReturn(adminUser);
        mvc.perform(get("/users/{id}", userId).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.phoneNumber").value("+6591235436"))
                .andExpect(jsonPath("$.faculty").value("School of Computing"))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.updatedAt").exists());
    }

    @Test
    void nonAdminCannotReadAnotherUserProfile() throws Exception {
        mvc.perform(get("/users/{id}", userId).with(jwt())).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsInvalidAdminPhoneNumber() throws Exception {
        mvc.perform(patch("/users/{id}", userId)
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Alex","email":"alex@example.com","roles":["USER"],"phoneNumber":"91234567"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.phoneNumber").exists());
        verifyNoInteractions(service);
    }

    @Test
    void unsupportedEmailDomainReturnsBadRequest() throws Exception {
        when(service.registerUser(any())).thenThrow(new UnsupportedEmailDomainException());
        mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Jamie","email":"jamie@gmail.com","password":"password123"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Please use your NUS email address."));
    }

    @Test
    void updatesUsingJwtIdentityAndNormalizedBody() throws Exception {
        when(service.updateUserProfile(any())).thenReturn(profile);
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" Alex Tan \",\"email\":\" ALEX@EXAMPLE.COM \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("alex@example.com"));
        verify(service).updateUserProfile(new UpdateUserProfileRequest("Alex Tan", null, null));
    }

    @Test
    void rejectsUnauthenticatedReadAndUpdate() throws Exception {
        mvc.perform(get("/users/brief").param("ids", userId.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get("/users/me")).andExpect(status().isUnauthorized());
        mvc.perform(put("/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Alex\",\"email\":\"alex@example.com\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void normalizesOptionalProfileDetails() throws Exception {
        when(service.updateUserProfile(any())).thenReturn(profile);
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Alex Tan","email":"alex@example.com",
                                 "phoneNumber":" +65 9123-5436 ","faculty":" School of Computing "}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneNumber").value("+6591235436"));
        verify(service)
                .updateUserProfile(new UpdateUserProfileRequest("Alex Tan", "+6591235436", "School of Computing"));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"{}", "{\"phoneNumber\":null,\"faculty\":null}", "{\"phoneNumber\":\"   \",\"faculty\":\"   \"}"
            })
    void acceptsEmptyOptionalDetails(String optionalFields) throws Exception {
        var fields = optionalFields.substring(1, optionalFields.length() - 1);
        var body =
                "{\"name\":\"Alex Tan\",\"email\":\"alex@example.com\"" + (fields.isEmpty() ? "" : "," + fields) + "}";
        when(service.updateUserProfile(any())).thenReturn(profile);
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
        verify(service).updateUserProfile(new UpdateUserProfileRequest("Alex Tan", null, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"91235436", "+012345678", "+65abc123", "+1234567890123456", "+1", "---"})
    void rejectsInvalidPhoneNumbers(String phone) throws Exception {
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                "{\"name\":\"Alex\",\"email\":\"alex@example.com\",\"phoneNumber\":\"" + phone + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.phoneNumber").exists());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsOversizedFaculty() throws Exception {
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Alex\",\"email\":\"alex@example.com\",\"faculty\":\"" + "a".repeat(256)
                                + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.faculty").exists());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsInvalidBearerToken() throws Exception {
        when(decoder.decode("invalid-token")).thenThrow(new BadJwtException("Invalid token"));
        mvc.perform(get("/users/me").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"name\":\"   \",\"email\":\"alex@example.com\"}",
                "{\"email\":\"alex@example.com\"}",
                "{\"name\":null,\"email\":\"alex@example.com\"}"
            })
    void rejectsMissingOrBlankName(String body) throws Exception {
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.name").exists());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsOversizedName() throws Exception {
        mvc.perform(put("/users/me")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + "a".repeat(256) + "\",\"email\":\"alex@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.name").exists());
        verifyNoInteractions(service);
    }

    @Test
    void returnsNotFoundForMissingUser() throws Exception {
        when(service.getUserProfile()).thenThrow(new UserNotFoundException("User not found"));
        mvc.perform(get("/users/me").with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("User not found"));
    }

    @Test
    void registrationUsesGlobalValidationErrors() throws Exception {
        mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"email\":\"invalid\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors.name").exists())
                .andExpect(jsonPath("$.fieldErrors.email").exists())
                .andExpect(jsonPath("$.fieldErrors.password").exists());
        verifyNoInteractions(service);
    }

    @Test
    void emailVerificationEndpointsArePublicAndResendNormalizesTheAddress() throws Exception {
        mvc.perform(post("/auth/email-verification/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"mail-token\"}"))
                .andExpect(status().isNoContent());
        verify(verification).verifyEmail("mail-token");
        mvc.perform(post("/auth/email-verification/resend")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\" JAMIE@U.NUS.EDU \"}"))
                .andExpect(status().isNoContent());
        verify(verification).resendRegistrationVerification("jamie@u.nus.edu");
    }

    @Test
    void emailChangeRequiresLoginButConfirmationOnlyRequiresTheLink() throws Exception {
        var body = "{\"email\":\" NEW@NUS.EDU.SG \"}";
        mvc.perform(post("/users/me/email-change")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(emailChangeService);
        mvc.perform(post("/users/me/email-change")
                        .with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());
        verify(emailChangeService).requestChange("new@nus.edu.sg");
        mvc.perform(post("/users/email-change/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"change-token\"}"))
                .andExpect(status().isNoContent());
        verify(emailChangeService).confirmChange("change-token");
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({
        UserController.class,
        AuthController.class,
        PasswordController.class,
        AvatarController.class,
        SecurityConfig.class,
        GlobalExceptionHandler.class,
        JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class
    })
    static class TestConfig {
        @Bean
        EmailChangeService emailChangeService() {
            return mock(EmailChangeService.class);
        }

        @Bean
        EmailVerificationService emailVerificationService() {
            return mock(EmailVerificationService.class);
        }

        @Bean
        AuthService authService() {
            return mock(AuthService.class);
        }

        @Bean
        AvatarService avatarService() {
            return mock(AvatarService.class);
        }

        @Bean
        PasswordService passwordService() {
            return mock(PasswordService.class);
        }

        @Bean
        AuthCookieFactory authCookieFactory() {
            var properties = mock(AuthProperties.class);
            when(properties.refreshCookieSecure()).thenReturn(true);
            return new AuthCookieFactory(properties);
        }

        @Bean
        UserDetailsService userDetailsService() {
            // The production configuration also has a username/password provider.
            // Supply it here so its AuthenticationManager has a concrete delegate.
            return mock(UserDetailsService.class);
        }

        @Bean
        UserService userService() {
            return mock(UserService.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }

        @Bean
        JwtAuthenticationConverter jwtAuthenticationConverter() {
            return new JwtAuthenticationConverter();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
