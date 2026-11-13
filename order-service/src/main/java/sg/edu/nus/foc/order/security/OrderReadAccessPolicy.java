package sg.edu.nus.foc.order.security;

import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;

/** Relationship authorization; a guessed ID must not reveal a private order. */
@Component
public class OrderReadAccessPolicy {
    private final UserServicePort users;
    private final String mode;

    public OrderReadAccessPolicy(UserServicePort users, @Value("${order.peers.mode:mock}") String mode) {
        this.users = users;
        this.mode = mode;
    }

    public void check(Order order) {
        if (!(SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken caller)
                || !caller.isAuthenticated()) {
            // The explicitly selected mock adapter has no authenticated remote identity.
            if ("mock".equals(mode)) return;
            throw new OrderProblem("UNAUTHENTICATED", "Authentication is required.");
        }
        String actor = caller.getToken().getSubject();
        boolean admin = caller.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        if (admin || (actor != null && (actor.equals(order.getRequesterId()) || actor.equals(order.getCourierId())))) return;
        boolean courier = caller.getAuthorities().stream().anyMatch(a -> "ROLE_COURIER".equals(a.getAuthority()));
        if (courier && order.getStatus() == OrderStatus.OPEN && order.getCourierId() == null
                && order.getExpiresAt().isAfter(Instant.now())) {
            try {
                if (actor != null && actor.equals(users.verifyCourier(actor, "Bearer " + caller.getToken().getTokenValue()))) return;
            } catch (OrderProblem denied) {
                if (!"FORBIDDEN".equals(denied.getCode()) && !"NOT_FOUND".equals(denied.getCode())) throw denied;
            }
        }
        throw OrderProblem.notFound("Order not found.");
    }
}
