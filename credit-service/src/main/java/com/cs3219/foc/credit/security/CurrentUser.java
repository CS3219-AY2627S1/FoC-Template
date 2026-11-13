package com.cs3219.foc.credit.security;

import java.util.Set;
import java.util.UUID;

public record CurrentUser(UUID userId, Set<String> roles) {
    public boolean hasRole(String role) {
        return roles.contains(role);
    }
}
