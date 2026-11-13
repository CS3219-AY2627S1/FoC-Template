/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Implemented the user service firebase role converter based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.security;

import java.util.Collection;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/** Converts User Service-confirmed roles into Spring Security authorities. */
public class FirebaseRoleAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    private final RoleProvider roleProvider;

    public FirebaseRoleAuthoritiesConverter(RoleProvider roleProvider) {
        this.roleProvider = roleProvider;
    }

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        try {
            return roleProvider.rolesFor(jwt).stream()
                    .sorted()
                    .map(role -> (GrantedAuthority) new SimpleGrantedAuthority(role.authority()))
                    .toList();
        } catch (RoleLookupException exception) {
            throw new AuthenticationServiceException("User Service role lookup is unavailable.", exception);
        }
    }
}
