package com.cs3219.foc.supplier.security;

import java.util.Optional;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationContextService {
    public Optional<Authentication> getAuthentication() {
        return Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication());
    }

    public Authentication requireAuthentication() {
        return getAuthentication()
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Authenticated user is unavailable"));
    }
}
