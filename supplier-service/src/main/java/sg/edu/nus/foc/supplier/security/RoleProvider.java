package sg.edu.nus.foc.supplier.security;

import java.util.Set;

import org.springframework.security.oauth2.jwt.Jwt;

/** Resolves a signed-in user's roles from the User Service (the source of truth for roles). */
public interface RoleProvider {

    /**
     * @param caller the caller's verified Firebase ID token ({@code sub} is the user ID)
     * @throws RoleLookupException if the User Service cannot be reached or answers unexpectedly
     */
    Set<Role> rolesFor(Jwt caller);
}
