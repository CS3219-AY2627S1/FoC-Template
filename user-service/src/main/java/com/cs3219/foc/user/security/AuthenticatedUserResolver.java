package com.cs3219.foc.user.security;

import com.cs3219.foc.user.model.entity.UserRole;
import java.util.Collection;
import java.util.HashSet;
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

        if (authentication.getPrincipal() instanceof CustomUserDetails userDetails) {
            var userId = userDetails.getUserId();
            if (userId == null) {
                return Optional.empty();
            }
            var roles = userDetails.getRoles();
            return Optional.of(new CurrentUser(userId, roles == null ? Set.of() : new HashSet<>(roles)));
        }

        try {
            return Optional.of(new CurrentUser(
                    UUID.fromString(authentication.getName()), rolesFromAuthorities(authentication.getAuthorities())));
        } catch (IllegalArgumentException | NullPointerException exception) {
            return Optional.empty();
        }
    }

    private static Set<UserRole> rolesFromAuthorities(Collection<? extends GrantedAuthority> authorities) {
        if (authorities == null) {
            return Set.of();
        }
        return authorities.stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority != null && authority.startsWith(ROLE_PREFIX))
                .map(authority -> authority.substring(ROLE_PREFIX.length()))
                .map(AuthenticatedUserResolver::toRole)
                .flatMap(Optional::stream)
                .collect(Collectors.toSet());
    }

    private static Optional<UserRole> toRole(String authority) {
        try {
            return Optional.of(UserRole.valueOf(authority));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
