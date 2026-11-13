package sg.edu.nus.foc.credit.security;

import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/** Resolves authoritative application roles for a verified Firebase caller. */
public interface RoleProvider {
    Set<Role> rolesFor(Jwt caller);
}
