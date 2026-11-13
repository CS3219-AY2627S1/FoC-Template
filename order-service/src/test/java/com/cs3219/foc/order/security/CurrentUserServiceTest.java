package com.cs3219.foc.order.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class CurrentUserServiceTest {
    private final AuthenticationContextService authenticationContextService = mock(AuthenticationContextService.class);
    private final AuthenticatedUserResolver authenticatedUserResolver = mock(AuthenticatedUserResolver.class);
    private final CurrentUserService service =
            new CurrentUserService(authenticationContextService, authenticatedUserResolver);

    @Test
    void findCurrentUserResolvesAuthenticationFromContext() {
        var userId = UUID.randomUUID();
        var authentication = new UsernamePasswordAuthenticationToken(userId.toString(), "n/a");
        var currentUser = new CurrentUser(userId, Set.of("USER"));
        when(authenticationContextService.getAuthentication()).thenReturn(Optional.of(authentication));
        when(authenticatedUserResolver.resolve(authentication)).thenReturn(Optional.of(currentUser));

        assertThat(service.findCurrentUser()).contains(currentUser);
        assertThat(service.requireCurrentUserId()).isEqualTo(userId);
        assertThat(service.hasRole("USER")).isTrue();
    }

    @Test
    void requireCurrentUserIdThrowsWhenUserIsMissing() {
        when(authenticationContextService.getAuthentication()).thenReturn(Optional.empty());

        assertThatThrownBy(service::requireCurrentUserId)
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }

    @Test
    void hasRoleReturnsFalseWhenUserIsMissing() {
        when(authenticationContextService.getAuthentication()).thenReturn(Optional.empty());

        assertThat(service.hasRole("ADMIN")).isFalse();
    }
}
