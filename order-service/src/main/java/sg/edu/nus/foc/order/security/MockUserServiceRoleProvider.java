package sg.edu.nus.foc.order.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.oauth2.jwt.Jwt;

/** Local stand-in matching Supplier Service's mock role behavior. */
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
        Set<Role> roles = EnumSet.of(Role.REQUESTER, Role.COURIER);
        String email = caller.getClaimAsString("email");
        if (email != null && adminEmails.contains(email.strip().toLowerCase(Locale.ROOT))) {
            roles.add(Role.ADMIN);
        }
        return roles;
    }

    @Override
    public CallerRoleContext contextFor(Jwt caller) {
        return new CallerRoleContext(rolesFor(caller), false);
    }
}
