package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.domain.OrderProblem;

class VerifiedOrderCallerTest {

    @AfterEach
    void clearCaller() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void localAndSystemPathsRetainAdapterIdentityWithoutJwt() {
        assertTrue(VerifiedOrderCaller.identityFor(Role.REQUESTER, "local-user").isEmpty());
        MockPeerAdapters peers = new MockPeerAdapters();
        assertEquals("local-user", peers.verifyRequester("local-user", null));
        assertEquals("another-user", peers.verifyCourier("another-user", null));
    }

    @Test
    void allRolesAreInspectedAndMockPeersCannotAcceptForgedProductionIdentity() {
        caller("u1", "ROLE_ADMIN", "ROLE_REQUESTER", "ROLE_COURIER");
        MockPeerAdapters peers = new MockPeerAdapters();
        assertEquals("u1", peers.verifyRequester("u1", "Bearer token"));
        assertEquals("u1", peers.verifyCourier("u1", "Bearer token"));
        OrderProblem mismatch = assertThrows(OrderProblem.class,
                () -> peers.verifyRequester("someone-else", "Bearer token"));
        assertEquals("FORBIDDEN", mismatch.getCode());
    }

    @Test
    void missingRoleAndBlankSubjectFailClosed() {
        caller("u1", "ROLE_ADMIN");
        assertThrows(OrderProblem.class, () -> VerifiedOrderCaller.identityFor(Role.COURIER, "u1"));
        caller(" ", "ROLE_COURIER");
        assertThrows(OrderProblem.class, () -> VerifiedOrderCaller.identityFor(Role.COURIER, " "));
        caller(null, "ROLE_COURIER");
        assertThrows(OrderProblem.class, () -> VerifiedOrderCaller.identityFor(Role.COURIER, "u1"));
    }

    @Test
    void unverifiedJwtCannotSupplyIdentity() {
        JwtAuthenticationToken authentication = caller("u1", "ROLE_COURIER");
        authentication.setAuthenticated(false);
        OrderProblem problem = assertThrows(OrderProblem.class,
                () -> VerifiedOrderCaller.identityFor(Role.COURIER, "u1"));
        assertEquals("UNAUTHENTICATED", problem.getCode());
    }

    private JwtAuthenticationToken caller(String subject, String... roles) {
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "RS256")
                .claim("aud", "demo-foc").subject(subject).build();
        List<SimpleGrantedAuthority> authorities = java.util.Arrays.stream(roles)
                .map(SimpleGrantedAuthority::new).toList();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt, authorities);
        SecurityContextHolder.getContext().setAuthentication(authentication);
        return authentication;
    }
}
