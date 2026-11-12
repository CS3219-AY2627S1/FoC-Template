/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.auth;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.repository.RefreshTokenRepository;
import com.campuscouriers.user.security.access.JwtService;
import com.campuscouriers.user.security.refresh.RefreshTokenService;
import com.campuscouriers.user.security.refresh.TokenHasher;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Full context on the test profile: JwtService signs/verifies with TestJwtKeyConfig's in-memory keys
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class LogoutEndpointTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private JwtService jwtService;
    @Autowired private RefreshTokenService refreshTokenService;
    @Autowired private TokenHasher tokenHasher;

    private String aliceAccessToken;
    private String aliceRefreshToken;
    private String bobRefreshToken;

    @BeforeEach
    void createAccountsAndSessions() {
        Account alice = accountRepository.save(new Account(AccountType.Student, VALID_EMAIL, "hashed-password"));
        Account bob = accountRepository.save(new Account(AccountType.Student, "bob@u.nus.edu", "hashed-password"));

        aliceAccessToken = jwtService.generateAccessToken(alice);
        aliceRefreshToken = refreshTokenService.issue(alice);
        bobRefreshToken = refreshTokenService.issue(bob);
    }

    @AfterEach
    void cleanUp() {
        refreshTokenRepository.deleteAll();
        accountRepository.deleteAll();
    }

    // F3 - Logout Profile: /auth/logout
    @Nested
    @DisplayName("F3 - Logout Profile: /auth/logout")
    class LogoutTests {

        @DisplayName("F3.2 - Valid logout revokes the current device's refresh token without redirecting")
        @Test
        void logout_withValidTokens_returns204AndRevokesTheRefreshToken() throws Exception {
            mockMvc.perform(postLogout(aliceRefreshToken)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + aliceAccessToken))
                    .andExpect(status().isNoContent())
                    .andExpect(content().string(""))
                    .andExpect(header().doesNotExist(HttpHeaders.LOCATION));

            assertThat(refreshTokenExists(aliceRefreshToken)).isFalse();
        }

        @DisplayName("F3.2 - Valid logout clears the refresh token cookie")
        @Test
        void logout_withValidTokens_clearsTheRefreshTokenCookie() throws Exception {
            mockMvc.perform(postLogout(aliceRefreshToken)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + aliceAccessToken))
                    .andExpect(status().isNoContent())
                    .andExpect(cookie().value("refreshToken", ""))
                    .andExpect(cookie().maxAge("refreshToken", 0))
                    .andExpect(cookie().path("refreshToken", "/auth"))
                    .andExpect(cookie().httpOnly("refreshToken", true))
                    .andExpect(cookie().secure("refreshToken", true))
                    .andExpect(cookie().sameSite("refreshToken", "Strict"));
        }

        @DisplayName("F3.3 - Logout without a refresh token cookie shall return 204 and still clear the cookie")
        @Test
        void logout_withoutRefreshTokenCookie_returns204AndClearsTheCookie() throws Exception {
            mockMvc.perform(post("/auth/logout")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + aliceAccessToken))
                    .andExpect(status().isNoContent())
                    .andExpect(cookie().maxAge("refreshToken", 0));

            assertThat(refreshTokenExists(aliceRefreshToken)).isTrue();
        }

        @DisplayName("F3.3 - Logout shall be safe to repeat")
        @Test
        void logout_repeated_returns204() throws Exception {
            for (int i = 0; i < 2; i++) {
                mockMvc.perform(postLogout(aliceRefreshToken)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + aliceAccessToken))
                        .andExpect(status().isNoContent());
            }
        }

        @DisplayName("F3.1.1 - Logout without an access token shall be rejected with 401")
        @Test
        void logout_withoutAccessToken_returns401() throws Exception {
            mockMvc.perform(postLogout(aliceRefreshToken))
                    .andExpect(status().isUnauthorized());

            assertThat(refreshTokenExists(aliceRefreshToken)).isTrue();
        }

        @DisplayName("F3.1.1 - Logout with an invalid access token shall be rejected with 401")
        @Test
        void logout_withInvalidAccessToken_returns401() throws Exception {
            mockMvc.perform(postLogout(aliceRefreshToken)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                    .andExpect(status().isUnauthorized());

            assertThat(refreshTokenExists(aliceRefreshToken)).isTrue();
        }

        @DisplayName("F3.1.1 - Logout with another account's refresh token shall return 204 and change nothing")
        @Test
        void logout_withAnotherAccountsRefreshToken_returns204AndLeavesItIntact() throws Exception {
            mockMvc.perform(postLogout(bobRefreshToken)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + aliceAccessToken))
                    .andExpect(status().isNoContent());

            assertThat(refreshTokenExists(bobRefreshToken)).isTrue();
            assertThat(refreshTokenExists(aliceRefreshToken)).isTrue();
        }

    }

    // ---- Helpers ----
    private MockHttpServletRequestBuilder postLogout(String refreshToken) {
        return post("/auth/logout")
                .cookie(new Cookie("refreshToken", refreshToken));
    }

    private boolean refreshTokenExists(String rawToken) {
        return refreshTokenRepository.findByTokenHash(tokenHasher.hash(rawToken)).isPresent();
    }

}
