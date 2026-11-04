package sg.edu.nus.foc.order.security;

import java.util.Collection;
import java.util.ArrayList;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

public class FirebaseRoleAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {
    private final RoleProvider roleProvider;

    public FirebaseRoleAuthoritiesConverter(RoleProvider roleProvider) {
        this.roleProvider = roleProvider;
    }

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        try {
            CallerRoleContext context = roleProvider.contextFor(jwt);
            // Role-only providers remain compatible; an absent flag cannot authorize acceptance.
            if (context == null) context = new CallerRoleContext(roleProvider.rolesFor(jwt), null);
            Collection<GrantedAuthority> authorities = new ArrayList<>(context.roles().stream()
                    .sorted()
                    .map(role -> (GrantedAuthority) new SimpleGrantedAuthority(role.authority()))
                    .toList());
            if (context.roles().contains(Role.COURIER) && context.courierSuspended() != null) {
                authorities.add(new CourierSuspensionAuthority(context.courierSuspended()));
            }
            return authorities;
        } catch (RoleLookupException exception) {
            throw new AuthenticationServiceException("User Service role lookup is unavailable.", exception);
        }
    }
}
