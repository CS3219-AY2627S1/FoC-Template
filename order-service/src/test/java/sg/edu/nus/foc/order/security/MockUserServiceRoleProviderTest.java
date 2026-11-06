package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class MockUserServiceRoleProviderTest {
    @Test
    void regularUserReceivesRequesterAndCourierRolesOnly() {
        MockUserServiceRoleProvider provider = new MockUserServiceRoleProvider(List.of("admin@u.nus.edu"));

        Set<Role> roles = provider.rolesFor(jwt("user@u.nus.edu"));

        assertEquals(Set.of(Role.REQUESTER, Role.COURIER), roles);
    }

    @Test
    void configuredAdminEmailReceivesAdminRoleCaseInsensitively() {
        MockUserServiceRoleProvider provider = new MockUserServiceRoleProvider(List.of(" admin@u.nus.edu "));

        Set<Role> roles = provider.rolesFor(jwt("ADMIN@u.nus.edu"));

        assertTrue(roles.contains(Role.ADMIN));
    }

    private Jwt jwt(String email) {
        return Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject("user-id")
                .claim("email", email)
                .issuedAt(Instant.parse("2026-10-01T00:00:00Z"))
                .expiresAt(Instant.parse("2026-10-02T00:00:00Z"))
                .build();
    }
}
