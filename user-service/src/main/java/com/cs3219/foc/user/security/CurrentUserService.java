package com.cs3219.foc.user.security;

import com.cs3219.foc.user.model.entity.UserRole;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CurrentUserService {
    private final AuthenticationContextService authenticationContextService;
    private final AuthenticatedUserResolver authenticatedUserResolver;

    public Optional<CurrentUser> findCurrentUser() {
        return authenticationContextService.getAuthentication().flatMap(authenticatedUserResolver::resolve);
    }

    public CurrentUser requireCurrentUser() {
        return findCurrentUser()
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Authenticated user is unavailable"));
    }

    public UUID requireCurrentUserId() {
        var currentUser = requireCurrentUser();
        return currentUser.userId();
    }

    public boolean hasRole(UserRole role) {
        return findCurrentUser().map(user -> user.hasRole(role)).orElse(false);
    }
}
