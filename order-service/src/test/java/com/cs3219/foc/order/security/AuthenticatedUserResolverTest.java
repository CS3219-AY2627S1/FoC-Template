package com.cs3219.foc.order.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class AuthenticatedUserResolverTest {
    private final AuthenticatedUserResolver resolver = new AuthenticatedUserResolver();
    private final UUID userId = UUID.randomUUID();

    @Test
    void resolvesUserFromJwtSubjectAndAuthorities() {
        var jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(userId.toString())
                .build();
        var authentication = new JwtAuthenticationToken(
                jwt, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"), new SimpleGrantedAuthority("SCOPE_read")));

        assertThat(resolver.resolve(authentication)).contains(new CurrentUser(userId, Set.of("ADMIN")));
    }

    @Test
    void returnsEmptyWhenSubjectIsMalformed() {
        var authentication = new UsernamePasswordAuthenticationToken(
                "not-a-uuid", "password", List.of(new SimpleGrantedAuthority("ROLE_USER")));

        assertThat(resolver.resolve(authentication)).isEmpty();
    }

    @Test
    void returnsEmptyWhenAuthenticationIsMissing() {
        assertThat(resolver.resolve(null)).isEmpty();
        assertThat(resolver.resolve(new UsernamePasswordAuthenticationToken("user", "password")))
                .isEmpty();
    }
}
