package sg.edu.nus.foc.supplier.security;

import java.util.Set;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * The caller's roles, looked up only for the endpoints that need them: catalogue management, the admin-only
 * status filters and {@code /permissions}. Browsing the catalogue and the Order Service's validation calls
 * only need a valid token, so they keep working while the User Service is slow or down.
 *
 * <p>Used in {@code @PreAuthorize("@callerRoles.isAdmin(authentication)")}. If the User Service cannot be
 * reached, {@link RoleLookupException} propagates and the request fails with 503.
 */
@Component("callerRoles")
public class CallerRoles {

    private final RoleProvider roleProvider;

    public CallerRoles(RoleProvider roleProvider) {
        this.roleProvider = roleProvider;
    }

    /** @throws RoleLookupException if the User Service cannot be reached */
    public Set<Role> of(Authentication authentication) {
        if (authentication instanceof JwtAuthenticationToken token) {
            return roleProvider.rolesFor(token.getToken());
        }
        return Set.of();
    }

    /** @throws RoleLookupException if the User Service cannot be reached */
    public boolean isAdmin(Authentication authentication) {
        if (authentication instanceof JwtAuthenticationToken token && roleProvider instanceof CachingRoleProvider cached) {
            return cached.currentRolesFor(token.getToken()).contains(Role.ADMIN);
        }
        return of(authentication).contains(Role.ADMIN);
    }
}
