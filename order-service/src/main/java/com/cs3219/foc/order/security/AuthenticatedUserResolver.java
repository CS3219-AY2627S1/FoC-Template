package com.cs3219.foc.order.security;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

@Component
public class AuthenticatedUserResolver {
    private static final String ROLE_PREFIX = "ROLE_";

    public Optional<CurrentUser> resolve(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return Optional.empty();
        }

        try {
            return Optional.of(new CurrentUser(
                    UUID.fromString(authentication.getName()), rolesFromAuthorities(authentication.getAuthorities())));
        } catch (IllegalArgumentException | NullPointerException exception) {
            return Optional.empty();
        }
    }

    private static Set<String> rolesFromAuthorities(Collection<? extends GrantedAuthority> authorities) {
        if (authorities == null) {
            return Set.of();
        }
        return authorities.stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority != null && authority.startsWith(ROLE_PREFIX))
                .map(authority -> authority.substring(ROLE_PREFIX.length()))
                .collect(Collectors.toSet());
    }
}
