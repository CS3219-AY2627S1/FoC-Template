package sg.edu.nus.foc.supplier.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Stand-in for the User Service until its role API exists ({@code USER_SERVICE_MODE=mock}).
 * Mirrors the User Service rules from the backlog: everyone is a requester and a courier
 * (User F5.1.1-2); admins are assigned explicitly (F5.1.3), here via {@code MOCK_ADMIN_EMAILS}.
 */
public class MockUserServiceRoleProvider implements RoleProvider {

    private final Set<String> adminEmails;

    public MockUserServiceRoleProvider(List<String> adminEmails) {
        this.adminEmails = adminEmails.stream()
                .map(email -> email.strip().toLowerCase(Locale.ROOT))
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        String email = caller.getClaimAsString("email");
        Set<Role> roles = EnumSet.of(Role.REQUESTER, Role.COURIER);
        if (email != null && adminEmails.contains(email.strip().toLowerCase(Locale.ROOT))) {
            roles.add(Role.ADMIN);
        }
        return roles;
    }
}
