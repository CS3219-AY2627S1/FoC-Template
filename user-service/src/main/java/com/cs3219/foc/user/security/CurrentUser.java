package com.cs3219.foc.user.security;

import com.cs3219.foc.user.model.entity.UserRole;
import java.util.Set;
import java.util.UUID;

public record CurrentUser(UUID userId, Set<UserRole> roles) {
    public boolean hasRole(UserRole role) {
        return roles.contains(role);
    }
}
