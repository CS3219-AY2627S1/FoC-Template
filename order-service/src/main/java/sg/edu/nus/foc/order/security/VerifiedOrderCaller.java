package sg.edu.nus.foc.order.security;

import java.util.Optional;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import sg.edu.nus.foc.order.domain.OrderProblem;

/** Reuses role facts from this request's validated JWT; local/system callers use their adapter. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class VerifiedOrderCaller {

    public static Optional<String> identityFor(Role requiredRole, String requestedId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken caller)) {
            return Optional.empty();
        }
        if (!caller.isAuthenticated()) {
            throw new OrderProblem("UNAUTHENTICATED", "Authentication is required.");
        }

        String userId = caller.getToken().getSubject();
        boolean hasRole = caller.getAuthorities().stream()
                .anyMatch(authority -> requiredRole.authority().equals(authority.getAuthority()));
        if (userId == null || userId.isBlank() || !userId.equals(requestedId) || !hasRole) {
            throw OrderProblem.forbidden("The caller does not match the required role and identity.");
        }
        return Optional.of(userId);
    }
}
