package sg.edu.nus.foc.order.security;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderReadAccessPolicyTest {
    private final UserServicePort users = mock(UserServicePort.class);
    private final OrderReadAccessPolicy policy = new OrderReadAccessPolicy(users, "http");

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private Order open() {
        Instant now = Instant.now();
        return Order.open("requester", "item", "pickup", "delivery", 5, 15, now, now.plusSeconds(7200));
    }

    private void caller(String uid, String role) {
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "RS256").subject(uid).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Test void requesterAndAdminMayReadButUnrelatedRequesterGetsNotFound() {
        Order order = open();
        caller("requester", "REQUESTER");
        assertDoesNotThrow(() -> policy.check(order));
        caller("admin", "ADMIN");
        assertDoesNotThrow(() -> policy.check(order));
        caller("other", "REQUESTER");
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class, () -> policy.check(order)).getCode());
    }

    @Test void eligibleCourierMayBrowseOnlyAvailableOpenOrders() {
        Order order = open();
        caller("courier", "COURIER");
        when(users.verifyCourier("courier", "Bearer token")).thenReturn("courier");
        assertDoesNotThrow(() -> policy.check(order));
        order.accept("assigned", 0, Instant.now());
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class, () -> policy.check(order)).getCode());
        caller("assigned", "COURIER");
        assertDoesNotThrow(() -> policy.check(order));
    }

    @Test void ineligibleAndUnauthenticatedCallersCannotReadPrivateOrders() {
        caller("courier", "COURIER");
        when(users.verifyCourier("courier", "Bearer token")).thenThrow(OrderProblem.forbidden("ineligible"));
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class, () -> policy.check(open())).getCode());
        SecurityContextHolder.clearContext();
        assertEquals("UNAUTHENTICATED", assertThrows(OrderProblem.class, () -> policy.check(open())).getCode());
    }
}
