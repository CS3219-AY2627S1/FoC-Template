package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.exception.EmailVerificationException;
import com.cs3219.foc.user.model.dto.LoginRequest;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CustomUserDetails;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class AuthServiceTests {
    @Test
    void correctCredentialsForAnUnverifiedAccountCannotIssueEitherToken() {
        var manager = mock(AuthenticationManager.class);
        var tokenService = mock(TokenService.class);
        var userRepository = mock(UserRepository.class);
        var service = new AuthService(manager, tokenService, userRepository);
        var user = CustomUserDetails.from(User.builder()
                .id(UUID.randomUUID())
                .email("jamie@u.nus.edu")
                .passwordHash("hash")
                .roles(List.of(UserRole.USER))
                .build());
        when(manager.authenticate(any()))
                .thenReturn(UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()));

        assertThatThrownBy(() -> service.login(new LoginRequest("jamie@u.nus.edu", "password123")))
                .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                        .isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(tokenService);
    }
}
