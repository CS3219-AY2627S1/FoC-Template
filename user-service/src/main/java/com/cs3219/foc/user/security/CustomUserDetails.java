package com.cs3219.foc.user.security;

import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.model.entity.UserRole;
import java.io.Serial;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@Builder
@RequiredArgsConstructor
public class CustomUserDetails implements UserDetails {
    @Serial
    private static final long serialVersionUID = 1L;

    @Getter
    private final UUID userId;

    private final String email;
    private final @Nullable String passwordHash;

    @Getter
    private final List<UserRole> roles;

    @Getter
    private final boolean emailVerified;

    public static CustomUserDetails from(User user) {
        return new CustomUserDetails(
                user.getId(), user.getEmail(), user.getPasswordHash(), user.getRoles(), user.isEmailVerified());
    }

    @Override
    @NullMarked
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Optional.ofNullable(roles).stream()
                .flatMap(Collection::stream)
                .map(role -> "ROLE_" + role)
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toSet());
    }

    @Override
    public @Nullable String getPassword() {
        return passwordHash;
    }

    @Override
    @NullMarked
    public String getUsername() {
        return email;
    }
}
