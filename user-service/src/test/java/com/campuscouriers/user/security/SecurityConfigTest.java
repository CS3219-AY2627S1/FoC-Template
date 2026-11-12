/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security;

import com.campuscouriers.user.auth.AuthController;
import com.campuscouriers.user.auth.AuthService;
import com.campuscouriers.user.auth.AuthTokens;
import com.campuscouriers.user.auth.dto.LoginRequest;
import com.campuscouriers.user.security.access.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static com.campuscouriers.user.TestConstants.VALID_PASSWORD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
// The whitespace after the comma checks that configured origins are trimmed
@TestPropertySource(properties = "app.cors.allowed-origins=http://localhost:5173, https://app.example")
class SecurityConfigTest {

    private static final String FRONTEND_ORIGIN = "http://localhost:5173";
    private static final String SECOND_ORIGIN = "https://app.example";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private CorsConfigurationSource corsConfigurationSource;
    @MockitoBean
    private AuthService authService;
    @MockitoBean
    private JwtService jwtService;    // required by SecurityConfig's JwtAuthenticationFilter

    @Test
    void corsConfiguration_containsTheConfiguredOriginsAndAllowsCredentials() {
        CorsConfiguration configuration = corsConfigurationSource
                .getCorsConfiguration(new MockHttpServletRequest("GET", "/profiles/me"));

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins()).containsExactly(FRONTEND_ORIGIN, SECOND_ORIGIN);
        assertThat(configuration.getAllowCredentials()).isTrue();
        assertThat(configuration.getAllowedMethods()).containsExactly("GET", "POST", "PATCH", "OPTIONS");
        assertThat(configuration.getAllowedHeaders()).containsExactly("Authorization", "Content-Type");
    }

    @Test
    void preflight_fromConfiguredFrontendOrigin_isAllowedWithCredentials() throws Exception {
        mockMvc.perform(options("/auth/refresh")
                        .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, "GET,POST,PATCH,OPTIONS"));
    }

    @Test
    void preflight_fromSecondConfiguredOrigin_isAllowed() throws Exception {
        mockMvc.perform(options("/auth/login")
                        .header(HttpHeaders.ORIGIN, SECOND_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, SECOND_ORIGIN));
    }

    @Test
    void preflight_fromUnknownOrigin_isRejected() throws Exception {
        mockMvc.perform(options("/auth/login")
                        .header(HttpHeaders.ORIGIN, "https://untrusted.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void actualRequest_fromConfiguredFrontendOrigin_includesCorsHeaders() throws Exception {
        when(authService.login(new LoginRequest(VALID_EMAIL, VALID_PASSWORD)))
                .thenReturn(new AuthTokens("access-token", "refresh-token", 900L));

        mockMvc.perform(post("/auth/login")
                        .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(String.format("""
                            {"email":"%s","password":"%s"}
                            """, VALID_EMAIL, VALID_PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

}
