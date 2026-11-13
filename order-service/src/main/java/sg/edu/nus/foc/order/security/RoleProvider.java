package sg.edu.nus.foc.order.security;

import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/** Resolves authorization roles for a verified Firebase identity. */
public interface RoleProvider {
    Set<Role> rolesFor(Jwt caller);

    default CallerRoleContext contextFor(Jwt caller) {
        return new CallerRoleContext(rolesFor(caller), null);
    }
}
