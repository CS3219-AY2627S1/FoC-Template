/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SecurityComponentsTest {
    private static final Instant NOW = Instant.now();

    @Test void mapsRolesAndMockAdminsWithoutTrustingUnknownValues() {
        assertEquals(Role.ADMIN, Role.fromId(" admin ").orElseThrow());
        assertTrue(Role.fromId(null).isEmpty()); assertTrue(Role.fromId("owner").isEmpty());
        var provider = new MockRoleProvider(List.of(" ADMIN@U.NUS.EDU ", ""));
        assertTrue(provider.rolesFor(jwt("u", "admin@u.nus.edu")).containsAll(Set.of(Role.REQUESTER, Role.COURIER, Role.ADMIN)));
        assertFalse(provider.rolesFor(jwt("v", null)).contains(Role.ADMIN));
    }

    @Test void httpRolesForwardTokenIgnoreUnknownsAndMapNotFoundOrOutage() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://users");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://users/api/users/role-context")).andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
                .andRespond(withSuccess("{\"roles\":[\"admin\",\"future-role\"]}", MediaType.APPLICATION_JSON));
        assertEquals(Set.of(Role.ADMIN), new HttpRoleProvider(builder.build()).rolesFor(jwt("u", null)));

        RestClient.Builder missingBuilder = RestClient.builder().baseUrl("http://users");
        MockRestServiceServer missing = MockRestServiceServer.bindTo(missingBuilder).build();
        missing.expect(requestTo("http://users/api/users/role-context")).andRespond(withResourceNotFound());
        assertTrue(new HttpRoleProvider(missingBuilder.build()).rolesFor(jwt("u", null)).isEmpty());

        RestClient.Builder downBuilder = RestClient.builder().baseUrl("http://users");
        MockRestServiceServer down = MockRestServiceServer.bindTo(downBuilder).build();
        down.expect(requestTo("http://users/api/users/role-context")).andRespond(withServerError());
        assertThrows(RoleLookupException.class, () -> new HttpRoleProvider(downBuilder.build()).rolesFor(jwt("u", null)));
    }

    @Test void cachesRolesUntilExpiryAndBoundsTheCache() {
        AtomicInteger calls = new AtomicInteger(); RoleProvider delegate = caller -> { calls.incrementAndGet(); return Set.of(Role.ADMIN); };
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        var cache = new CachingRoleProvider(delegate, Duration.ofMinutes(1), clock);
        assertEquals(Set.of(Role.ADMIN), cache.rolesFor(jwt("same", null))); cache.rolesFor(jwt("same", null));
        assertEquals(1, calls.get());
        var expiring = new CachingRoleProvider(delegate, Duration.ZERO, clock);
        expiring.rolesFor(jwt("expired", null)); expiring.rolesFor(jwt("expired", null));
        assertEquals(3, calls.get());
        for (int i = 0; i <= 10_001; i++) expiring.rolesFor(jwt("u" + i, null));
        assertTrue(calls.get() > 10_000);
    }

    @Test void callerRolesAcceptsOnlyJwtAdministrators() {
        CallerRoles callerRoles = new CallerRoles(caller -> Set.of(Role.ADMIN));
        assertTrue(callerRoles.isAdmin(new JwtAuthenticationToken(jwt("u", null))));
        assertFalse(callerRoles.isAdmin(new TestingAuthenticationToken("u", "x")));
        assertFalse(new CallerRoles(caller -> Set.of()).isAdmin(new JwtAuthenticationToken(jwt("u", null))));
    }

    @Test void emulatorDecoderEnforcesFirebaseClaimsAndRejectsMalformedTokens() throws Exception {
        EmulatorJwtDecoder decoder = new EmulatorJwtDecoder("demo-foc");
        assertEquals("u", decoder.decode(token("demo-foc", "u", NOW.minusSeconds(1), NOW.plusSeconds(300))).getSubject());
        assertThrows(JwtValidationException.class, () -> decoder.decode(token("other", "u", NOW.minusSeconds(1), NOW.plusSeconds(300))));
        assertThrows(BadJwtException.class, () -> decoder.decode("not-a-token"));
        String missingExpiry = new PlainJWT(new JWTClaimsSet.Builder().issuer("https://securetoken.google.com/demo-foc").audience("demo-foc").subject("u").build()).serialize();
        assertThrows(BadJwtException.class, () -> decoder.decode(missingExpiry));
        assertThrows(BadJwtException.class, () -> decoder.decode(token("demo-foc", "u", NOW.plusSeconds(60), NOW)));
    }

    @Test void securityHandlersWriteStandardJsonEnvelopes() throws Exception {
        var handlers = new JsonSecurityHandlers(JsonMapper.builder().build(), Clock.fixed(NOW, ZoneOffset.UTC));
        var request = new MockHttpServletRequest("GET", "/api/reports"); var unauthenticated = new MockHttpServletResponse();
        handlers.commence(request, unauthenticated, new org.springframework.security.authentication.BadCredentialsException("bad"));
        assertEquals(401, unauthenticated.getStatus()); assertEquals("Bearer", unauthenticated.getHeader("WWW-Authenticate")); assertTrue(unauthenticated.getContentAsString().contains("UNAUTHENTICATED"));
        var forbidden = new MockHttpServletResponse(); handlers.handle(request, forbidden, new org.springframework.security.access.AccessDeniedException("no"));
        assertEquals(403, forbidden.getStatus()); assertTrue(forbidden.getContentAsString().contains("FORBIDDEN"));
    }

    @Test void securityConfigurationCoversMockHttpEmulatorAndProductionBranches() {
        SecurityConfig config = new SecurityConfig(); Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        var defaults = new ReportingProperties(null, null, null, null, null, List.of("http://localhost"));
        assertInstanceOf(MockRoleProvider.class, config.roleProvider(defaults, clock));
        assertNotNull(config.converter()); assertNotNull(config.cors(defaults)); assertNotNull(config.handlers(JsonMapper.builder().build(), clock));
        var emulator = properties(new ReportingProperties.Auth("demo-foc", "localhost:9099"), new ReportingProperties.UserService(ReportingProperties.Mode.MOCK, "", List.of(), Duration.ofSeconds(1), Duration.ZERO));
        assertInstanceOf(EmulatorJwtDecoder.class, config.decoder(emulator));
        var http = properties(new ReportingProperties.Auth("demo-foc", ""), new ReportingProperties.UserService(ReportingProperties.Mode.HTTP, "http://users", List.of(), Duration.ofSeconds(1), Duration.ZERO));
        assertInstanceOf(HttpRoleProvider.class, config.roleProvider(http, clock)); assertNotNull(config.decoder(http));
        var cached = properties(http.auth(), new ReportingProperties.UserService(ReportingProperties.Mode.HTTP, "http://users", List.of(), Duration.ofSeconds(1), Duration.ofSeconds(1)));
        assertInstanceOf(CachingRoleProvider.class, config.roleProvider(cached, clock));
        var missing = properties(http.auth(), new ReportingProperties.UserService(ReportingProperties.Mode.HTTP, "", List.of(), Duration.ofSeconds(1), Duration.ZERO));
        assertThrows(IllegalStateException.class, () -> config.roleProvider(missing, clock));
    }

    private static ReportingProperties properties(ReportingProperties.Auth auth, ReportingProperties.UserService users) {
        return new ReportingProperties(null, null, auth, users, null, List.of());
    }
    private static Jwt jwt(String subject, String email) {
        return Jwt.withTokenValue("token").header("alg", "none").subject(subject).claim("email", email).build();
    }
    private static String token(String audience, String subject, Instant issued, Instant expires) throws Exception {
        return new PlainJWT(new JWTClaimsSet.Builder().issuer("https://securetoken.google.com/demo-foc").audience(audience).subject(subject)
                .issueTime(Date.from(issued)).expirationTime(Date.from(expires)).build()).serialize();
    }
}
