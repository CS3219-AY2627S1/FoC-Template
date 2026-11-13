package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Set;
import java.util.Collection;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class FirebaseRoleAuthoritiesConverterTest {
    @Test
    void convertsUserServiceRolesToSpringAuthorities() {
        RoleProvider provider = mock(RoleProvider.class);
        when(provider.rolesFor(org.mockito.ArgumentMatchers.any(Jwt.class)))
                .thenReturn(Set.of(Role.ADMIN, Role.REQUESTER));

        Collection<GrantedAuthority> authorities = new FirebaseRoleAuthoritiesConverter(provider).convert(
                Jwt.withTokenValue("token").header("alg", "none").subject("user").build());

        assertEquals(Set.of("ROLE_ADMIN", "ROLE_REQUESTER"), authorities.stream()
                .map(GrantedAuthority::getAuthority)
                .collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void convertsRoleLookupFailureToAuthenticationServiceFailure() {
        RoleProvider provider = mock(RoleProvider.class);
        when(provider.rolesFor(org.mockito.ArgumentMatchers.any(Jwt.class)))
                .thenThrow(new RoleLookupException("offline", new IllegalStateException()));

        FirebaseRoleAuthoritiesConverter converter = new FirebaseRoleAuthoritiesConverter(provider);
        Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject("user").build();

        AuthenticationServiceException failure = assertThrows(
                AuthenticationServiceException.class,
                () -> converter.convert(jwt));
        assertEquals(RoleLookupException.class, failure.getCause().getClass());
    }
}
