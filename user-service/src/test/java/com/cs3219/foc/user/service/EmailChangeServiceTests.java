package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.exception.EmailVerificationException;
import com.cs3219.foc.user.model.entity.EmailToken;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

class EmailChangeServiceTests {
    @Test
    void requestChangeUsesAuthenticatedId() {
        var userRepository = mock(UserRepository.class);
        var emailTokenService = mock(EmailTokenService.class);
        var currentUserService = mock(CurrentUserService.class);
        var userId = UUID.randomUUID();
        var user = User.builder().id(userId).email("old@u.nus.edu").build();
        when(currentUserService.requireCurrentUserId()).thenReturn(userId);
        when(userRepository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        var service = new EmailChangeService(
                userRepository, emailTokenService, mock(ApplicationEventPublisher.class), currentUserService);

        service.requestChange("new@nus.edu.sg");

        verify(emailTokenService).issue(user, "new@nus.edu.sg", EmailTokenPurpose.EMAIL_CHANGE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"users_email_key", "other_constraint"})
    void mapsOnlyTheEmailUniqueConstraintToAnEmailConflict(String constraint) {
        var userRepository = mock(UserRepository.class);
        var emailTokenService = mock(EmailTokenService.class);
        var user = User.builder().id(UUID.randomUUID()).email("old@u.nus.edu").build();
        var stored = new EmailToken();
        stored.setUserId(user.getId());
        stored.setEmail("new@nus.edu.sg");
        when(emailTokenService.consume("token", EmailTokenPurpose.EMAIL_CHANGE)).thenReturn(stored);
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        var failure = new DataIntegrityViolationException(
                "Database constraint",
                new ConstraintViolationException(
                        "Constraint violation", new SQLException("Constraint violation", "23505"), constraint));
        when(userRepository.saveAndFlush(user)).thenThrow(failure);

        var thrown = catchThrowable(() -> new EmailChangeService(
                        userRepository,
                        emailTokenService,
                        mock(ApplicationEventPublisher.class),
                        mock(CurrentUserService.class))
                .confirmChange("token"));

        if (constraint.equals("users_email_key")) {
            assertThat(thrown)
                    .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                            .isEqualTo(HttpStatus.CONFLICT));
        } else {
            assertThat(thrown).isSameAs(failure);
        }
    }
}
