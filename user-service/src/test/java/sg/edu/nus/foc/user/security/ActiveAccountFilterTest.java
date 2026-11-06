/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;

class ActiveAccountFilterTest {

    private static final String USER_ID = "firebase-user-123";

    private UserRepository userRepository;
    private ActiveAccountFilter filter;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        filter = new ActiveAccountFilter(userRepository);

        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void allowsActiveAccount() throws Exception {
        User user = userWithStatus(AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsPendingAccount() throws Exception {
        User user = userWithStatus(AccountStatus.DEACTIVATION_PENDING);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", true);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString())
                .contains("\"error\":\"FORBIDDEN\"")
                .contains("Account is not active.");
    }

    @Test
    void rejectsDeactivatedAccount() throws Exception {
        User user = userWithStatus(AccountStatus.DEACTIVATED);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", true);

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void rejectsUnknownAccount() throws Exception {
        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.empty());

        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", true);

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void returns503WhenAccountLookupFails() throws Exception {
        when(userRepository.findByUserId(USER_ID))
                .thenThrow(new RuntimeException("MongoDB unavailable"));

        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", true);

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getContentAsString())
                .contains("\"error\":\"SERVICE_UNAVAILABLE\"")
                .contains("Account authorization could not be confirmed.");
    }

    @Test
    void skipsAccountCheckForRegistration() throws Exception {
        MockHttpServletResponse response = invoke(
                "POST", "/api/users", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckForRoleContext() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/api/users/role-context", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckForRequesterEligibility() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/api/users/requester-eligibility", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckForCourierEligibility() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/api/users/courier-eligibility", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckForAdminEligibility() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/api/users/admin-eligibility", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckWhenAuthenticationIsNotJwt() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/api/users/me", false);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    @Test
    void skipsAccountCheckForPathsOutsideUserApi() throws Exception {
        MockHttpServletResponse response = invoke(
                "GET", "/actuator/health", true);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(userRepository);
    }

    private MockHttpServletResponse invoke(
            String method,
            String path,
            boolean authenticated) throws ServletException, IOException {

        MockHttpServletRequest request =
                new MockHttpServletRequest(method, path);

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        if (authenticated) {
            Jwt jwt = Jwt.withTokenValue("firebase-token")
                    .header("alg", "RS256")
                    .subject(USER_ID)
                    .issuer("https://securetoken.google.com/demo-foc")
                    .audience(List.of("demo-foc"))
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();

            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt));
        }

        AtomicBoolean chainContinued = new AtomicBoolean(false);

        FilterChain chain = (req, res) ->
                chainContinued.set(true);

        filter.doFilter(request, response, chain);

        if (response.getStatus() == 200) {
            assertThat(chainContinued).isTrue();
        } else {
            assertThat(chainContinued).isFalse();
        }

        return response;
    }

    private User userWithStatus(AccountStatus status) {
        User user = mock(User.class);
        when(user.getStatus()).thenReturn(status);
        return user;
    }
}
