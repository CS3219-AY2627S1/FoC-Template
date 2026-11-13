package com.cs3219.foc.user.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.cs3219.foc.user.model.entity.UserRole;
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

        assertThat(resolver.resolve(authentication)).contains(new CurrentUser(userId, Set.of(UserRole.ADMIN)));
    }

    @Test
    void resolvesUserFromCustomUserDetails() {
        var userDetails = new CustomUserDetails(userId, "user@example.com", "hash", List.of(UserRole.USER), true);
        var authentication =
                new UsernamePasswordAuthenticationToken(userDetails, "password", userDetails.getAuthorities());

        assertThat(resolver.resolve(authentication)).contains(new CurrentUser(userId, Set.of(UserRole.USER)));
    }

    @Test
    void resolvesUserFromUuidAuthenticationName() {
        var authentication = new UsernamePasswordAuthenticationToken(
                userId.toString(), "password", List.of(new SimpleGrantedAuthority("ROLE_USER")));

        assertThat(resolver.resolve(authentication)).contains(new CurrentUser(userId, Set.of(UserRole.USER)));
    }

    @Test
    void ignoresUnknownRoles() {
        var authentication = new UsernamePasswordAuthenticationToken(
                userId.toString(), "password", List.of(new SimpleGrantedAuthority("ROLE_LANDLORD")));

        assertThat(resolver.resolve(authentication)).contains(new CurrentUser(userId, Set.of()));
    }

    @Test
    void returnsEmptyWhenSubjectIsMalformed() {
        var authentication = new UsernamePasswordAuthenticationToken(
                "not-a-uuid", "password", List.of(new SimpleGrantedAuthority("ROLE_USER")));

        assertThat(resolver.resolve(authentication)).isEmpty();
    }

    @Test
    void returnsEmptyWhenAuthenticationIsMissingOrAnonymous() {
        assertThat(resolver.resolve(null)).isEmpty();
        assertThat(resolver.resolve(new UsernamePasswordAuthenticationToken("user", "password")))
                .isEmpty();
    }

    @Test
    void returnsEmptyWhenCustomUserDetailsHasNoUserId() {
        var userDetails = new CustomUserDetails(null, "user@example.com", "hash", List.of(UserRole.USER), true);
        var authentication =
                new UsernamePasswordAuthenticationToken(userDetails, "password", userDetails.getAuthorities());

        assertThat(resolver.resolve(authentication)).isEmpty();
    }
}
