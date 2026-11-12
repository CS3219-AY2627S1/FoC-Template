/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.auth;

import static com.campuscouriers.user.TestConstants.*;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.HashMap;

import com.campuscouriers.user.auth.dto.LoginRequest;
import com.campuscouriers.user.auth.dto.RegisterRequest;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InvalidCredentialsException;
import com.campuscouriers.user.exception.InvalidRefreshTokenException;
import com.campuscouriers.user.security.SecurityConfig;
import com.campuscouriers.user.security.access.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @MockitoBean
    private AuthService authService;
    @MockitoBean
    private JwtService jwtService;    // required by SecurityConfig's JwtAuthenticationFilter

    ObjectMapper objectMapper = new ObjectMapper();

    private static final int REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;    // app.jwt.refresh-token-ttl=7d

    // F1 - Register Profile: /auth/register
    @Nested
    @DisplayName("F1 - Register Profile: /auth/register")
    class RegistrationTests {

        @DisplayName("Valid Registration Request")
        // Valid Request
        @Test
        void register_validRequest_returns201AndDelegatesToService() throws Exception {
            Map<String, String> body = validBody();
            postRegister(body).andExpect(status().isCreated());
            verify(authService).register(
                new RegisterRequest(
                        VALID_NAME,
                        VALID_EMAIL,
                        VALID_PASSWORD
                )
            );
        }

        @Nested
        @DisplayName("F1.1 - The service should validate the name, NUS email, and password")
        class ValidateRegistrationTests {

            // F1.1.1 - Missing Fields
            @DisplayName("F1.1.1 - Name, email, and password shall not allowed to be null")
            @ParameterizedTest
            @ValueSource(strings = {"name", "email", "password"})
            void register_missingField_returns400(String field) throws Exception {
                Map<String, String> body = validBody();
                body.remove(field);
                postRegister(body).andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.1 - Empty Fields
            @DisplayName("F1.1.1 - Name, email, and password shall not be allowed to be empty")
            @ParameterizedTest
            @ValueSource(strings = {"name", "email", "password"})
            void register_emptyField_returns400(String field) throws Exception {
                postRegisterWith(field, "")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.1 - Maximum Name Length
            @DisplayName("F1.1.1 - Name should have a maximum length of 50 characters")
            @Test
            void register_longName_returns400() throws Exception {
                postRegisterWith("name", "ThisIsAVeryLongNameThatCannotFitInto50Characters ThisIsAVeryLongSurname")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.2 - Duplicate Email Exception
            @DisplayName("F1.1.2 - Email shall not be allowed if there is an existing registration with the same email")
            @Test
            void register_duplicateEmail_returns409() throws Exception {
                doThrow(new EmailAlreadyRegisteredException())
                        .when(authService).register(any(RegisterRequest.class));
                postRegister(validBody()).andExpect(status().isConflict());
            }

            // F1.1.3 - Valid NUS Email Domain
            @DisplayName("F1.1.3 - Email format shall be validated")
            @Test
            void register_nonNUSEmail_returns400() throws Exception {
                postRegisterWith("email", "NTUStudent@gmail.com")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.3 - Valid Email Format
            @DisplayName("F1.1.3 - Email format shall be validated to have an NUS domain")
            @Test
            void register_malformedEmail_returns400() throws Exception {
                postRegisterWith("email", "not-an-email")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Password Contains Uppercase
            @DisplayName("F1.1.4 - Passwords should be validated to contain uppercase characters")
            @Test
            void register_noUpperCasePassword_returns400() throws Exception {
                postRegisterWith("password", "lower+!_12345678")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Password Contains Lowercase
            @DisplayName("F1.1.4 - Passwords should be validated to contain uppercase characters")
            @Test
            void register_noLowerCasePassword_returns400() throws Exception {
                postRegisterWith("password", "UPPER+!_12345678")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Password Contains Numbers
            @DisplayName("F1.1.4 - Passwords should be validated to contain numbers")
            @Test
            void register_noNumberPassword_returns400() throws Exception {
                postRegisterWith("password", "lower+!_UPPERCASEATTHEEND")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Password Contains Special Characters
            @DisplayName("F1.1.4 - Passwords should be validated to contain special characters")
            @Test
            void register_noSpecialCharacterPassword_returns400() throws Exception {
                postRegisterWith("password", "lower123UPPERCASEATTHEEND")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Minimum Password Length
            @DisplayName("F1.1.4 - Passwords should be validated to contain at least 16 characters")
            @Test
            void register_shortPassword_returns400() throws Exception {
                postRegisterWith("password", "Sh0rt!123456789")
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

            // F1.1.4 - Maximum Password Length
            @DisplayName("F1.1.4 - Passwords should be validated to contain at most 128 characters")
            @Test
            void register_longPassword_returns400() throws Exception {
                postRegisterWith("password", "lowerUPPER1234+!".repeat(8).concat("a"))
                        .andExpect(status().isBadRequest());
                verifyNoInteractions(authService);
            }

        }

        // ---- Helpers ----
        private static Map<String, String> validBody() {
            Map<String, String> body = new HashMap<>();
            body.put("name", VALID_NAME);
            body.put("email", VALID_EMAIL);
            body.put("password", VALID_PASSWORD);
            return body;
        }

        private ResultActions postRegister(Map<String, String>body) throws Exception {
            return mockMvc.perform(post("/auth/register")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(body)));
        }

        private ResultActions postRegisterWith(String field, String modifiedValue) throws Exception {
            Map<String, String> body = validBody();
            body.put(field, modifiedValue);
            return postRegister(body);
        }

        // F2 - Login Profile: /auth/login
        @Nested
        @DisplayName("F2 - Login Profile: /auth/login")
        class LoginTests {

            @Test
            void login_withValidCredentials_returns200WithAccessTokenAndRefreshTokenCookie() throws Exception {
                AuthTokens tokens = new AuthTokens("access-token", "refresh-token", 900L);
                when(authService.login(new LoginRequest(VALID_EMAIL, VALID_PASSWORD))).thenReturn(tokens);

                mockMvc.perform(post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(String.format("""
                            {"email":"%s","password":"%s"}
                            """, VALID_EMAIL, VALID_PASSWORD)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.accessToken").value("access-token"))
                        .andExpect(jsonPath("$.refreshToken").doesNotExist())
                        .andExpect(jsonPath("$.tokenType").value("Bearer"))
                        .andExpect(jsonPath("$.expiresIn").value(900))
                        .andExpect(cookie().value("refreshToken", "refresh-token"))
                        .andExpect(cookie().httpOnly("refreshToken", true))
                        .andExpect(cookie().secure("refreshToken", true))
                        .andExpect(cookie().sameSite("refreshToken", "Strict"))
                        .andExpect(cookie().path("refreshToken", "/auth"))
                        .andExpect(cookie().maxAge("refreshToken", REFRESH_TOKEN_TTL_SECONDS))
                        .andExpect(header().string(HttpHeaders.SET_COOKIE, not(containsStringIgnoringCase("Domain"))));
            }

            @ParameterizedTest
            @ValueSource(strings = {"email", "password"})
            void login_missingField_returns400(String field) throws Exception {
                Map<String, String> body = new HashMap<>();
                body.put("email", VALID_EMAIL);
                body.put("password", VALID_PASSWORD);
                body.remove(field);

                mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body))
                ).andExpect(status().isBadRequest());
            }

            @Test
            void login_withInvalidCredentials_returns401() throws Exception {
                doThrow(new InvalidCredentialsException())
                        .when(authService).login(new LoginRequest(VALID_EMAIL, "wrong"));

                mockMvc.perform(post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(String.format("""
                            {"email":"%s","password":"wrong"}
                            """, VALID_EMAIL)))
                        .andExpect(status().isUnauthorized());
            }

        }

        // F4 - Refresh Token: /auth/refresh
        @Nested
        @DisplayName("F4 - Refresh Token: /auth/refresh")
        class RefreshTokenTests {
            @Test
            void refresh_withAValidCookie_returns200WithNewAccessTokenAndRotatedCookie() throws Exception {
                AuthTokens tokens = new AuthTokens("new-access", "new-refresh", 900L);
                when(authService.refresh("old-token")).thenReturn(tokens);

                mockMvc.perform(post("/auth/refresh")
                                .cookie(new Cookie("refreshToken", "old-token")))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.accessToken").value("new-access"))
                        .andExpect(jsonPath("$.refreshToken").doesNotExist())
                        .andExpect(cookie().value("refreshToken", "new-refresh"))
                        .andExpect(cookie().httpOnly("refreshToken", true))
                        .andExpect(cookie().secure("refreshToken", true))
                        .andExpect(cookie().sameSite("refreshToken", "Strict"))
                        .andExpect(cookie().path("refreshToken", "/auth"))
                        .andExpect(cookie().maxAge("refreshToken", REFRESH_TOKEN_TTL_SECONDS));
            }

            @Test
            void refresh_withAnInvalidCookie_returns401() throws Exception {
                doThrow(new InvalidRefreshTokenException())
                        .when(authService).refresh("bad-token");

                mockMvc.perform(post("/auth/refresh")
                                .cookie(new Cookie("refreshToken", "bad-token")))
                        .andExpect(status().isUnauthorized());
            }

            @Test
            void refresh_withoutACookie_returns401() throws Exception {
                mockMvc.perform(post("/auth/refresh"))
                        .andExpect(status().isUnauthorized());
                verifyNoInteractions(authService);
            }

            @Test
            void refresh_ignoresATokenInTheBody_returns401() throws Exception {
                mockMvc.perform(post("/auth/refresh")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                            {"refreshToken":"old-token"}
                            """))
                        .andExpect(status().isUnauthorized());
                verifyNoInteractions(authService);
            }
        }
    }
}
