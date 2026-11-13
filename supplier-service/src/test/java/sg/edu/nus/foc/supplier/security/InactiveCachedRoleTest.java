package sg.edu.nus.foc.supplier.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Clock;
import java.time.Duration;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class InactiveCachedRoleTest {
    @Test
    void previouslyCachedAdminRoleCannotAuthorizeAnotherWriteAfterDeactivation() {
        RoleProvider current = mock(RoleProvider.class);
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "RS256").subject("student").build();
        when(current.rolesFor(jwt)).thenReturn(Set.of(Role.ADMIN), Set.of());
        CallerRoles roles = new CallerRoles(new CachingRoleProvider(current, Duration.ofMinutes(1), Clock.systemUTC()));
        JwtAuthenticationToken caller = new JwtAuthenticationToken(jwt);
        assertTrue(roles.of(caller).contains(Role.ADMIN));
        assertFalse(roles.isAdmin(caller), "Authorization must re-read roles rather than trust a cached positive result");
        verify(current, times(2)).rolesFor(jwt);
    }

    @Test
    void activeAdministratorStillPassesTheFreshLookup() {
        RoleProvider current = mock(RoleProvider.class);
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "RS256").subject("student").build();
        when(current.rolesFor(jwt)).thenReturn(Set.of(Role.ADMIN));
        assertTrue(new CallerRoles(current).isAdmin(new JwtAuthenticationToken(jwt)));
    }
}
